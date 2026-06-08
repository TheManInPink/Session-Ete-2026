/**
 * @file        notifications.service.ts
 * @description Cœur métier : rendu du template, idempotence, persistance de
 *              l'historique, expédition via le canal, et corrélation des DLR.
 *
 *              `processJob` est le point d'entrée UNIQUE partagé par le chemin
 *              HTTP (/send, synchrone) et le chemin RabbitMQ (consumer). Il ne
 *              gère PAS lui-même les ré-essais : il renvoie un résultat
 *              normalisé (SENT/FAILED + `permanent`) et le consumer décide de
 *              re-programmer ou d'abandonner. Les erreurs d'ENTRÉE (template /
 *              variable / canal invalides) sont LEVÉES (→ 400 côté HTTP, → DLQ
 *              côté consumer).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/notifications
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Notification } from '@nina-aes/database';
import type { Env } from '../config/env.schema.js';
import {
  LANGUAGES,
  NotificationChannel,
  NotificationStatus,
  normalizeChannel,
  type ChannelSendResult,
  type Lang,
  type RenderedMessage,
} from './channels/channel.types.js';
import { ChannelDispatcher } from './channels/channel.dispatcher.js';
import { AfricasTalkingSmsProvider } from './channels/sms.provider.js';
import { TemplateRegistry } from './templates/template.registry.js';
import { NotificationRepository } from './notification.repository.js';
import { NotificationsMetrics } from './metrics/notifications.metrics.js';
import { NotificationPublisher } from './consumer/notification.publisher.js';
import type { NotificationJob } from './job.types.js';
import type { BroadcastDto } from './dtos/broadcast.dto.js';

/** Statuts considérés comme « déjà délivrés » (court-circuit d'idempotence). */
const SUCCESS_STATES = new Set<string>([
  NotificationStatus.SENT,
  NotificationStatus.DELIVERED,
  NotificationStatus.READ,
]);

/** Résultat interne d'un traitement de job. */
export interface ProcessResult {
  notification: Notification;
  result: ChannelSendResult;
  /** Vrai si le job a été court-circuité (notification déjà délivrée). */
  deduped: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly defaultLang: Lang;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly registry: TemplateRegistry,
    private readonly dispatcher: ChannelDispatcher,
    private readonly repo: NotificationRepository,
    private readonly metrics: NotificationsMetrics,
    private readonly publisher: NotificationPublisher,
  ) {
    this.defaultLang = cfg.get('DEFAULT_LANGUAGE', { infer: true });
  }

  /**
   * Traite un job : rend → (idempotence) crée/récupère → expédie → persiste.
   *
   * @param job     Job de notification.
   * @param attempt Numéro de tentative (0 = initiale ; >0 = ré-essais).
   * @returns Résultat normalisé.
   * @throws BadRequestException / TemplateRenderError si l'entrée est invalide.
   */
  async processJob(job: NotificationJob, attempt = 0): Promise<ProcessResult> {
    const channel = this.resolveChannel(job);
    const lang = this.resolveLang(job.language);
    const variables = job.variables ?? {};

    // Rendu (lève TemplateRenderError si clé/canal/variable invalides).
    const rendered = this.registry.render(job.template, channel, lang, variables);
    const message: RenderedMessage = {
      recipient: job.recipient,
      ...(rendered.subject ? { subject: rendered.subject } : {}),
      body: rendered.body,
      language: rendered.language,
      ...(channel === NotificationChannel.PUSH ? { data: this.toStringMap(variables) } : {}),
    };

    // Idempotence : la CRÉATION de la ligne (contrainte UNIQUE sur dedupe_key)
    // sert de VERROU atomique d'expédition. Celui qui insère la ligne possède
    // l'envoi ; tout duplicata concurrent lève P2002 et NE ré-expédie pas. Ce
    // verrou DB ferme la course « deux messages identiques traités en parallèle »
    // (sinon : A crée PENDING + expédie pendant que B lit PENDING + expédie aussi).
    const dedupeKey = this.dedupeKey(job, channel);
    const payload = {
      recipient: job.recipient,
      variables,
      renderedSubject: rendered.subject ?? null,
      renderedBody: rendered.body,
      priority: job.priority ?? null,
    };

    /** Réponse « déjà pris en charge » (un autre worker s'en occupe / l'a fait). */
    const dedupedResult = (n: Notification): ProcessResult => ({
      notification: n,
      result: { status: NotificationStatus.SENT, providerId: n.providerId ?? undefined },
      deduped: true,
    });

    let notif: Notification;
    try {
      notif = await this.repo.create({
        recipientUserId: job.recipientUserId ?? null,
        recipientCitizenId: job.recipientCitizenId ?? null,
        channel,
        status: NotificationStatus.PENDING,
        templateKey: job.template,
        language: rendered.language,
        payload,
        dedupeKey,
      });
    } catch (err) {
      if (!NotificationRepository.isUniqueViolation(err)) throw err;
      const existing = await this.repo.findByDedupeKey(dedupeKey);
      if (!existing) throw err;
      // Déjà délivrée, OU en cours d'expédition par un autre worker (PENDING) :
      // on ne ré-expédie pas.
      if (SUCCESS_STATES.has(existing.status) || existing.status === NotificationStatus.PENDING) {
        return dedupedResult(existing);
      }
      // Échec antérieur (FAILED) → ré-essai légitime : claim atomique FAILED→PENDING.
      // Si un autre worker a déjà repris le ré-essai (course), on s'efface.
      const claimed = await this.repo.claimForRetry(existing.id);
      if (!claimed) return dedupedResult(existing);
      notif = { ...existing, status: NotificationStatus.PENDING };
    }

    // Expédition + mesure de latence.
    this.metrics.recordAttempt(channel);
    const startedAt = Date.now();
    const result = await this.dispatcher.dispatch(channel, message);
    this.metrics.recordResult(channel, result.status, Date.now() - startedAt);

    const patch =
      result.status === NotificationStatus.SENT
        ? {
            status: NotificationStatus.SENT,
            providerId: result.providerId ?? null,
            sentAt: new Date(),
          }
        : {
            status: NotificationStatus.FAILED,
            failureReason: result.failureReason ?? 'échec inconnu',
            // `attempt` (0 = initiale, n = n-ième ré-essai) est monotone et porté
            // par l'en-tête AMQP `x-nina-attempt` : il reflète donc le nombre de
            // ré-essais déjà effectués au moment de cet échec.
            retryCount: attempt,
          };
    notif = await this.repo.updateStatus(notif.id, patch);

    return { notification: notif, result, deduped: false };
  }

  /**
   * Envoi unique synchrone (endpoint /send).
   *
   * @param job Job construit depuis le DTO.
   * @returns Résultat du traitement.
   */
  sendOne(job: NotificationJob): Promise<ProcessResult> {
    return this.processJob(job, 0);
  }

  /**
   * Envoi en masse : publie un job par destinataire vers RabbitMQ. Le débit de
   * livraison est régulé par le consumer (prefetch + limiteur), pas ici.
   *
   * @param dto Requête de broadcast (template + destinataires).
   * @returns Récapitulatif (id de lot, nombre accepté, répartition par canal).
   */
  async broadcast(dto: BroadcastDto): Promise<{
    batchId: string;
    accepted: number;
    skipped: number;
    byChannel: Record<string, number>;
  }> {
    if (!this.publisher.isReady()) {
      throw new ServiceUnavailableException('Bus de notifications indisponible (RabbitMQ)');
    }
    if (!this.registry.has(dto.template)) {
      throw new BadRequestException(`Template inconnu : "${dto.template}"`);
    }

    const batchId = randomUUID();
    const byChannel: Record<string, number> = {};
    let accepted = 0;
    let skipped = 0;

    for (const r of dto.recipients) {
      const job: NotificationJob = {
        recipient: r.recipient,
        channel: dto.channel,
        template: dto.template,
        variables: { ...(dto.variables ?? {}), ...(r.variables ?? {}) },
        priority: dto.priority,
        language: dto.language,
        recipientUserId: r.recipientUserId ?? null,
        recipientCitizenId: r.recipientCitizenId ?? null,
        // Idempotence dérivée par destinataire (clé unique par recipient).
        idempotencyKey: null,
      };
      let channel: NotificationChannel;
      try {
        channel = this.resolveChannel(job);
      } catch {
        skipped += 1;
        continue;
      }
      await this.publisher.publishJob(job, channel);
      byChannel[channel] = (byChannel[channel] ?? 0) + 1;
      accepted += 1;
    }

    this.logger.log(`Broadcast ${batchId} : ${accepted} acceptés, ${skipped} ignorés`);
    return { batchId, accepted, skipped, byChannel };
  }

  /**
   * Lit le statut de livraison d'une notification.
   *
   * @param id UUID de la notification.
   * @returns Vue publique du statut.
   */
  async getStatus(id: string): Promise<Record<string, unknown>> {
    const n = await this.repo.findById(id);
    if (!n) throw new NotFoundException('Notification introuvable');
    return {
      id: n.id,
      status: n.status,
      channel: n.channel,
      templateKey: n.templateKey,
      language: n.language,
      providerId: n.providerId,
      sentAt: n.sentAt,
      deliveredAt: n.deliveredAt,
      failureReason: n.failureReason,
      retryCount: n.retryCount,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  /**
   * Applique un accusé de réception (DLR Africa's Talking) à une notification.
   *
   * @param providerId Identifiant fournisseur (messageId AT).
   * @param statusRaw  Statut DLR brut.
   * @returns Indique si une notification a été trouvée + son nouveau statut.
   */
  async handleDlr(
    providerId: string,
    statusRaw: string,
  ): Promise<{ matched: boolean; status?: string }> {
    const n = await this.repo.findByProviderId(providerId);
    if (!n) return { matched: false };

    const mapped = AfricasTalkingSmsProvider.mapDlrStatus(statusRaw);
    if (!mapped) return { matched: true, status: n.status }; // statut intermédiaire ignoré

    await this.repo.updateStatus(n.id, {
      status: mapped,
      ...(mapped === NotificationStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
    });
    if (mapped === NotificationStatus.DELIVERED) {
      this.metrics.recordDelivered(n.channel as NotificationChannel);
    }
    return { matched: true, status: mapped };
  }

  /** Métriques (envois/heure, taux de succès par canal, latence). */
  metricsSnapshot(): Record<string, unknown> {
    return this.metrics.snapshot();
  }

  /** Catalogue des templates disponibles. */
  listTemplates() {
    return this.registry.list();
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** Détermine le canal : forcé (normalisé) ou déduit du format du destinataire. */
  private resolveChannel(job: NotificationJob): NotificationChannel {
    if (job.channel) {
      const c = normalizeChannel(job.channel);
      if (!c) throw new BadRequestException(`Canal invalide : "${job.channel}"`);
      return c;
    }
    return this.inferChannel(job.recipient);
  }

  /** Heuristique de canal : numéro ⇒ SMS, email ⇒ EMAIL, sinon jeton ⇒ PUSH. */
  private inferChannel(recipient: string): NotificationChannel {
    const r = recipient.trim();
    if (/^\+?\d[\d\s-]{5,}$/.test(r)) return NotificationChannel.SMS;
    if (r.includes('@')) return NotificationChannel.EMAIL;
    return NotificationChannel.PUSH;
  }

  /** Valide/normalise la langue, avec repli sur la langue par défaut. */
  private resolveLang(input?: string): Lang {
    const up = input?.toUpperCase();
    return (LANGUAGES as readonly string[]).includes(up ?? '') ? (up as Lang) : this.defaultLang;
  }

  /** Clé d'idempotence SHA-256 (64 hex) — explicite ou dérivée. */
  private dedupeKey(job: NotificationJob, channel: NotificationChannel): string {
    const basis =
      job.idempotencyKey ??
      `${job.recipient}|${channel}|${job.template}|${stableStringify(job.variables ?? {})}`;
    return createHash('sha256').update(basis, 'utf8').digest('hex');
  }

  /** Convertit les variables en map de chaînes (payload `data` du push). */
  private toStringMap(vars: Record<string, string | number>): Record<string, string> {
    return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v)]));
  }
}

/** Sérialisation JSON déterministe (clés triées) pour une clé d'idempotence stable. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
