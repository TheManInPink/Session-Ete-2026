/**
 * @file        appointments.service.ts
 * @description Cœur métier des rendez-vous : création (anti-blacklist, validation
 *              de vulnérabilité, contrôle de créneau/quota concurrent-safe),
 *              cycle de vie (annulation, check-in, clôture), file d'attente
 *              virtuelle (Redis) et publication des notifications (confirmation,
 *              rappels, annulation) vers notification-service.
 *
 *              Transitions de statut :
 *                SCHEDULED ──cancel──▶ CANCELLED
 *                SCHEDULED ──check-in─▶ CONFIRMED ──complete──▶ COMPLETED
 *                SCHEDULED ──(cron, heure dépassée)──▶ NO_SHOW
 *              (CONFIRMED peut aussi être annulé ou clôturé.)
 *
 *              Toutes les transitions passent par un compare-and-set atomique
 *              (`repo.transition`) ⇒ pas de double check-in / double clôture.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSubject } from '@nina-aes/auth-guards';
import type { Env } from '../config/env.schema.js';
import {
  formatFrDateTime,
  formatFrTime,
  hhmmToMinutes,
  startOfUtcDay,
  utcDateKey,
} from '../common/time.util.js';
import { CentersService } from '../centers/centers.service.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { QueueService, type QueuePosition } from './queue.service.js';
import { NotificationPublisher } from './messaging/notification.publisher.js';
import {
  AppointmentRepository,
  SlotFullError,
  type AppointmentRow,
} from './appointment.repository.js';
import {
  AppointmentStatus,
  PriorityLevel,
  VULNERABILITY_CATEGORIES,
  type VulnerabilityCategory,
} from './appointment.enums.js';

/** Entrée de création (projetée depuis le DTO). */
export interface CreateAppointmentInput {
  citizenId: string;
  centerId: string;
  /** ISO 8601 du créneau choisi (doit correspondre à un début de créneau). */
  slot: string;
  reason: string;
  vulnerabilityCategory?: VulnerabilityCategory;
}

/** Vue publique d'un rendez-vous. */
export interface AppointmentView {
  id: string;
  citizenId: string;
  citizenName: string;
  centerId: string;
  centerName: string;
  status: string;
  priority: string;
  purpose: string;
  scheduledAt: string;
  queueNumber: number | null;
  completedAt: string | null;
  createdAt: string;
}

@Injectable()
export class AppointmentsService implements OnModuleInit {
  private readonly logger = new Logger(AppointmentsService.name);
  private readonly noShowWindowDays: number;
  private readonly noShowThreshold: number;
  private readonly blacklistTtlSeconds: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly repo: AppointmentRepository,
    private readonly centers: CentersService,
    private readonly queue: QueueService,
    private readonly publisher: NotificationPublisher,
    private readonly redis: RedisService,
  ) {
    this.noShowWindowDays = cfg.get('APPOINTMENT_NOSHOW_WINDOW_DAYS', { infer: true });
    this.noShowThreshold = cfg.get('APPOINTMENT_NOSHOW_THRESHOLD', { infer: true });
    this.blacklistTtlSeconds = cfg.get('APPOINTMENT_BLACKLIST_TTL_HOURS', { infer: true }) * 3600;
  }

  /**
   * Au démarrage, reconstruit les files d'attente Redis depuis la base si elles
   * ont été perdues (redémarrage de Redis). Best-effort : une erreur ici ne doit
   * jamais empêcher le service de démarrer (PostgreSQL reste la source de vérité).
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.recoverQueues();
    } catch (err) {
      this.logger.warn(`Reconstruction des files au démarrage ignorée : ${(err as Error).message}`);
    }
  }

  /**
   * Reconstruit les files Redis des RDV CONFIRMED récents (citoyens présents, en
   * attente) groupés par (centre, jour). `rebuildIfEmpty` ne réinsère QUE si la
   * file ciblée est vide ⇒ aucun clobber d'une file déjà vivante (redémarrage du
   * seul service, Redis intact). Le score = numéro de passage persisté ⇒ l'ordre
   * et les numéros d'origine sont préservés.
   */
  private async recoverQueues(): Promise<void> {
    // Fenêtre : aujourd'hui + la veille (marge UTC), les files plus anciennes
    // étant expirées (TTL) et sans intérêt opérationnel.
    const since = new Date(startOfUtcDay(new Date()).getTime() - 86_400_000);
    const rows = await this.repo.findConfirmedForRebuild(since);
    if (rows.length === 0) return;

    // Groupe par (centre, jour) ; conserve l'ordre par numéro de passage.
    const groups = new Map<
      string,
      { centerId: string; day: Date; entries: { appointmentId: string; order: number }[] }
    >();
    for (const r of rows) {
      if (r.queueNumber === null) continue; // garde-fou (déjà filtré côté requête)
      const day = startOfUtcDay(r.scheduledAt);
      const gk = `${r.centerId}:${utcDateKey(day)}`;
      let g = groups.get(gk);
      if (!g) {
        g = { centerId: r.centerId, day, entries: [] };
        groups.set(gk, g);
      }
      g.entries.push({ appointmentId: r.id, order: r.queueNumber });
    }

    let rebuilt = 0;
    for (const g of groups.values()) {
      if (await this.queue.rebuildIfEmpty(g.centerId, g.day, g.entries)) rebuilt += 1;
    }
    if (rebuilt > 0) {
      this.logger.log(`Files d'attente reconstruites depuis la base : ${rebuilt}`);
    }
  }

  // ── Création ──────────────────────────────────────────────────────────

  /**
   * Crée un rendez-vous. Refuse si le citoyen est sous blacklist no-show,
   * valide la catégorie de vulnérabilité éventuelle, vérifie que le créneau
   * existe/est ouvert/non complet, puis insère de façon concurrent-safe.
   */
  async create(input: CreateAppointmentInput, now: Date = new Date()): Promise<AppointmentView> {
    // 1. Blacklist temporaire (no-show) — échoue ouvert si Redis indisponible.
    if (await this.redis.isBlacklisted(this.blacklistKey(input.citizenId))) {
      const ttl = await this.redis.ttl(this.blacklistKey(input.citizenId));
      const hours = ttl > 0 ? Math.ceil(ttl / 3600) : this.blacklistTtlSeconds / 3600;
      throw new ConflictException(
        `Trop d'absences récentes : nouvelle prise de RDV bloquée encore ~${hours} h.`,
      );
    }

    // 2. Citoyen existant (non supprimé).
    const citizen = await this.repo.findCitizen(input.citizenId);
    if (!citizen) throw new NotFoundException('Citoyen introuvable');

    // 3. Priorité + éligibilité fenêtre prioritaire.
    let priority: PriorityLevel = PriorityLevel.P3;
    let eligiblePriority = false;
    if (input.vulnerabilityCategory) {
      if (!VULNERABILITY_CATEGORIES.includes(input.vulnerabilityCategory)) {
        throw new BadRequestException('Catégorie de vulnérabilité inconnue');
      }
      const ok = await this.repo.hasActiveVulnerability(
        input.citizenId,
        input.vulnerabilityCategory,
        startOfUtcDay(now),
      );
      if (!ok) {
        throw new ForbiddenException(
          'Catégorie de vulnérabilité non vérifiée pour ce citoyen (aucune fiche active).',
        );
      }
      priority = PriorityLevel.P1;
      eligiblePriority = true;
    }

    // 4. Créneau valide ?
    const scheduledAt = new Date(input.slot);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Créneau (slot) invalide : date ISO attendue.');
    }
    if (scheduledAt.getTime() <= now.getTime()) {
      throw new BadRequestException('Le créneau choisi est déjà passé.');
    }

    const dayKey = utcDateKey(scheduledAt);
    const { days } = await this.centers.getAvailability(input.centerId, dayKey, dayKey, now);
    const day = days[0];
    if (!day || !day.open) {
      throw new BadRequestException('Le centre est fermé à la date choisie.');
    }
    const slot = day.slots.find((s) => s.start === scheduledAt.toISOString());
    if (!slot) {
      throw new BadRequestException('Créneau inexistant (hors grille horaire du centre).');
    }
    if (slot.kind === 'PRIORITY' && !eligiblePriority) {
      throw new ForbiddenException(
        'Ce créneau est réservé aux personnes vulnérables (fenêtre prioritaire).',
      );
    }
    if (slot.remaining <= 0) {
      throw new ConflictException('Ce créneau est complet. Choisissez-en un autre.');
    }

    // 5. Insertion concurrent-safe : verrou consultatif au niveau JOUR + revérif
    //    des 3 niveaux de capacité (créneau / nature / jour) DANS la transaction.
    const center = await this.centers.getCenter(input.centerId, now);
    let row: AppointmentRow;
    try {
      row = await this.repo.createBookingAtomic(
        {
          citizenId: input.citizenId,
          centerId: input.centerId,
          scheduledAt,
          purpose: input.reason,
          priority,
        },
        {
          perSlotCapacity: center.parallelDesks,
          capacityPerDay: center.capacityPerDay,
          standardQuota: center.standardQuota,
          priorityQuota: center.priorityQuota,
          priorityFromMin: hhmmToMinutes(center.priorityWindow.from),
          priorityToMin: hhmmToMinutes(center.priorityWindow.to),
        },
      );
    } catch (err) {
      if (err instanceof SlotFullError) {
        throw new ConflictException('Ce créneau vient d’être complété. Choisissez-en un autre.');
      }
      throw err;
    }

    // 6. Confirmation (best-effort — n'échoue pas la création).
    await this.notify(row, 'appointment-confirmed', `appt:${row.id}:confirm`, {
      date: formatFrDateTime(row.scheduledAt),
      location: row.center.name,
    });

    return this.toView(row);
  }

  // ── Self-service citoyen (identité dérivée du NINA du token) ───────────

  /**
   * Résout l'`id` du citoyen à partir du NINA porté par son token. Centralise la
   * garde anti-IDOR : l'identité vient TOUJOURS du token, jamais d'un `citizenId`
   * fourni par le client. 403 si le token ne porte pas de NINA (rôle non-citoyen
   * ou token incomplet) ; 404 si aucun citoyen ne correspond.
   */
  private async resolveCitizenId(nina: string | undefined): Promise<string> {
    if (!nina) {
      throw new ForbiddenException('Self-service indisponible : NINA absent du token.');
    }
    const citizenId = await this.repo.findCitizenIdByNina(nina);
    if (!citizenId) {
      throw new NotFoundException('Aucun citoyen ne correspond à ce NINA.');
    }
    return citizenId;
  }

  /**
   * PC-04 self-service : le citoyen authentifié prend RDV pour LUI-MÊME. Le
   * `citizenId` est dérivé du NINA du token (jamais fourni par le client), puis la
   * création réutilise le cœur `create()` (blacklist, vulnérabilité, quotas).
   */
  async createForCitizen(
    nina: string | undefined,
    input: {
      centerId: string;
      slot: string;
      reason: string;
      vulnerabilityCategory?: VulnerabilityCategory;
    },
    now: Date = new Date(),
  ): Promise<AppointmentView> {
    const citizenId = await this.resolveCitizenId(nina);
    const view = await this.create({ ...input, citizenId }, now);
    // Trace d'imputabilité (l'acteur EST le citoyen). L'événement d'audit SIGNÉ
    // vers audit-service (`nina.audit`, origine authentifiée) est un chantier de
    // suivi — cf. CHANGELOG 0untricies.
    this.logger.log(
      `RDV self-service créé (citizen=${citizenId}, center=${input.centerId}, appt=${view.id})`,
    );
    return view;
  }

  /** PC-05 self-service : liste paginée des RDV du citoyen authentifié. */
  async listForCitizen(
    nina: string | undefined,
    opts: { status?: AppointmentStatus; page?: number; pageSize?: number } = {},
  ): Promise<{ page: number; pageSize: number; items: AppointmentView[] }> {
    const citizenId = await this.resolveCitizenId(nina);
    return this.list({ citizenId, status: opts.status, page: opts.page, pageSize: opts.pageSize });
  }

  /**
   * Annulation self-service : le citoyen ne peut annuler QUE ses propres RDV.
   * Contrôle de propriété AVANT toute action ; en cas de RDV inexistant OU
   * n'appartenant pas au citoyen, on renvoie un 404 uniforme (pas d'oracle
   * d'énumération révélant l'existence du RDV d'autrui).
   */
  async cancelForCitizen(id: string, nina: string | undefined): Promise<AppointmentView> {
    const citizenId = await this.resolveCitizenId(nina);
    const row = await this.repo.findById(id);
    if (!row || row.citizenId !== citizenId) {
      throw new NotFoundException('Rendez-vous introuvable');
    }
    const view = await this.cancel(id);
    this.logger.log(`RDV self-service annulé (citizen=${citizenId}, appt=${id})`);
    return view;
  }

  // ── Lecture ───────────────────────────────────────────────────────────

  /** Détail d'un RDV (404 si absent). */
  async getById(id: string): Promise<AppointmentView> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Rendez-vous introuvable');
    return this.toView(row);
  }

  /**
   * Liste filtrée + paginée. Au moins un filtre de portée (`citizenId` ou
   * `centerId`) est REQUIS : on refuse tout vidage global de la base (protection
   * anti-divulgation de masse / anti-amplification). Plafond dur : 200/page.
   */
  async list(filter: {
    citizenId?: string;
    status?: AppointmentStatus;
    centerId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ page: number; pageSize: number; items: AppointmentView[] }> {
    if (!filter.citizenId && !filter.centerId) {
      throw new BadRequestException('Un filtre de portée est requis : citizenId ou centerId.');
    }
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filter.pageSize ?? 50));
    const rows = await this.repo.list({
      citizenId: filter.citizenId,
      status: filter.status,
      centerId: filter.centerId,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { page, pageSize, items: rows.map((r) => this.toView(r)) };
  }

  // ── Cycle de vie ──────────────────────────────────────────────────────

  /** Annule un RDV (citoyen ou agent). Idempotent sur l'état terminal. */
  async cancel(id: string): Promise<AppointmentView> {
    const row = await this.requireAppointment(id);
    const ok = await this.repo.transition(
      id,
      [AppointmentStatus.REQUESTED, AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
      AppointmentStatus.CANCELLED,
    );
    if (!ok) {
      const status = await this.currentStatus(id, row.status);
      throw new ConflictException(`Annulation impossible (statut actuel : ${status}).`);
    }
    // Retire de la file si déjà en attente, puis notifie (best-effort).
    await this.queue.remove(row.centerId, row.scheduledAt, id);
    await this.notify(row, 'appointment-cancelled', `appt:${id}:cancel`, {
      date: formatFrDateTime(row.scheduledAt),
      location: row.center.name,
    });
    return this.getById(id);
  }

  /**
   * Check-in : le citoyen se présente au centre (rôle AGENT). Le RDV passe
   * SCHEDULED → CONFIRMED, entre en file d'attente virtuelle, et reçoit un
   * numéro de passage.
   */
  async checkIn(
    id: string,
    actor: AuthSubject,
  ): Promise<AppointmentView & { queue: QueuePosition }> {
    const row = await this.requireAppointment(id);
    const agentId = await this.repo.findInternalUserId(actor.userId);
    const ok = await this.repo.transition(
      id,
      [AppointmentStatus.SCHEDULED],
      AppointmentStatus.CONFIRMED,
      { agentId },
    );
    if (!ok) {
      const status = await this.currentStatus(id, row.status);
      throw new ConflictException(`Check-in impossible (statut actuel : ${status}).`);
    }

    // Entrée en file (priorité prise en compte dans le score). Si Redis est
    // indisponible, `enqueue` renvoie false : le RDV reste CONFIRMED mais sans
    // numéro de passage (mode dégradé explicite, plutôt qu'un faux « 0 »).
    const slotCfg = await this.centers.getCenter(row.centerId);
    const enqueued = await this.queue.enqueue(
      row.centerId,
      row.scheduledAt,
      id,
      Date.now(),
      row.priority as PriorityLevel,
    );
    const pos: QueuePosition = enqueued
      ? await this.queue.position(
          row.centerId,
          row.scheduledAt,
          id,
          slotCfg.slotDurationMin,
          slotCfg.parallelDesks,
        )
      : { position: 0, peopleAhead: 0, queueSize: 0, estimatedWaitMin: 0 };

    // Numéro de passage écrit via un compare-and-set GARDÉ sur CONFIRMED : si le
    // RDV a été annulé/clôturé en concurrence entre-temps, on ne le « ressuscite »
    // PAS — on défait l'entrée de file et on signale le conflit.
    const claimed = await this.repo.transition(
      id,
      [AppointmentStatus.CONFIRMED],
      AppointmentStatus.CONFIRMED,
      { queueNumber: enqueued ? pos.position : null },
    );
    if (!claimed) {
      await this.queue.remove(row.centerId, row.scheduledAt, id);
      const status = await this.currentStatus(id, 'inconnu');
      throw new ConflictException(
        `Check-in interrompu : le rendez-vous a changé d'état (${status}).`,
      );
    }

    const updated = await this.requireAppointment(id);
    return { ...this.toView(updated), queue: pos };
  }

  /** Clôture un RDV servi (rôle AGENT). CONFIRMED|SCHEDULED → COMPLETED. */
  async complete(id: string, actor: AuthSubject): Promise<AppointmentView> {
    const row = await this.requireAppointment(id);
    const agentId = await this.repo.findInternalUserId(actor.userId);
    const ok = await this.repo.transition(
      id,
      [AppointmentStatus.CONFIRMED, AppointmentStatus.SCHEDULED],
      AppointmentStatus.COMPLETED,
      { completedAt: new Date(), agentId },
    );
    if (!ok) {
      const status = await this.currentStatus(id, row.status);
      throw new ConflictException(`Clôture impossible (statut actuel : ${status}).`);
    }
    await this.queue.remove(row.centerId, row.scheduledAt, id);
    return this.getById(id);
  }

  // ── File d'attente (vue agent) ────────────────────────────────────────

  /**
   * File d'attente ordonnée d'un centre pour un jour donné.
   *
   * ⚠️ La file est indexée sur le **jour du rendez-vous** (`scheduledAt`), PAS
   * sur le jour calendaire courant : c'est ce jour qui sert de clé à
   * l'enqueue/position/remove (cohérence interne garantie). Le paramètre `date`
   * (YYYY-MM-DD) sélectionne explicitement ce jour ; à défaut on prend
   * aujourd'hui (cas nominal : check-in le jour même du RDV, en UTC — le Mali
   * étant à UTC+0). Pour consulter la file d'un RDV check-in un autre jour UTC,
   * passer `date` = jour du RDV.
   */
  async getCenterQueue(
    centerId: string,
    dateStr?: string,
    now: Date = new Date(),
  ): Promise<{
    centerId: string;
    date: string;
    entries: (AppointmentView & { position: number })[];
  }> {
    const center = await this.centers.getCenter(centerId, now); // 404 si centre inconnu
    const day = dateStr ? new Date(`${dateStr}T00:00:00Z`) : now;
    if (Number.isNaN(day.getTime())) throw new BadRequestException('Paramètre "date" invalide');

    const ordered = await this.queue.list(centerId, day);
    const rows = await this.repo.findByIds(ordered.map((e) => e.appointmentId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const entries = ordered
      .map((e, idx) => {
        const row = byId.get(e.appointmentId);
        return row ? { ...this.toView(row), position: idx + 1 } : null;
      })
      .filter((x): x is AppointmentView & { position: number } => x !== null);

    return { centerId: center.id, date: utcDateKey(day), entries };
  }

  // ── Tâches planifiées (appelées par le cron) ──────────────────────────

  /** Publie un rappel (J-1 ou H-2) pour un RDV. */
  async sendReminder(row: AppointmentRow, kind: '24h' | '2h'): Promise<void> {
    if (kind === '24h') {
      await this.notify(row, 'appointment-reminder-24h', `appt:${row.id}:reminder-24h`, {
        date: formatFrDateTime(row.scheduledAt),
        location: row.center.name,
      });
    } else {
      await this.notify(row, 'appointment-reminder-2h', `appt:${row.id}:reminder-2h`, {
        heure: formatFrTime(row.scheduledAt),
        location: row.center.name,
      });
    }
  }

  /**
   * Marque un RDV en NO_SHOW (transition atomique depuis SCHEDULED) puis applique
   * la blacklist temporaire si le seuil d'absences est dépassé sur la fenêtre.
   *
   * @returns `true` si le RDV a effectivement basculé en NO_SHOW.
   */
  async markNoShow(row: AppointmentRow, now: Date = new Date()): Promise<boolean> {
    const ok = await this.repo.transition(
      row.id,
      [AppointmentStatus.SCHEDULED],
      AppointmentStatus.NO_SHOW,
    );
    if (!ok) return false;

    const since = new Date(now.getTime() - this.noShowWindowDays * 86_400_000);
    const count = await this.repo.countNoShowsSince(row.citizenId, since);
    if (count >= this.noShowThreshold) {
      await this.redis.setBlacklist(this.blacklistKey(row.citizenId), this.blacklistTtlSeconds);
      this.logger.warn(
        `Citoyen ${row.citizenId} blacklisté ${this.blacklistTtlSeconds / 3600} h ` +
          `(${count} no-shows / ${this.noShowWindowDays} j).`,
      );
    }
    return true;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** Charge un RDV ou lève 404. */
  private async requireAppointment(id: string): Promise<AppointmentRow> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Rendez-vous introuvable');
    return row;
  }

  /**
   * Statut RÉEL courant pour un message de conflit : re-lit le RDV APRÈS l'échec
   * d'un compare-and-set, plutôt que de réutiliser le statut lu en début de
   * méthode (potentiellement périmé sous concurrence — c'est précisément une
   * transition concurrente qui a fait échouer le CAS). Lecture sur le chemin
   * d'erreur uniquement (rare) ; `fallback` si le RDV a disparu entre-temps.
   */
  private async currentStatus(id: string, fallback: string): Promise<string> {
    try {
      const current = await this.repo.findById(id);
      return current?.status ?? fallback;
    } catch {
      // Chemin d'erreur (rare) : une panne de cette re-lecture ne doit JAMAIS
      // transformer le 409 de conflit en 500. On retombe sur le statut déjà
      // chargé (périmé mais sûr) — le code HTTP attendu est préservé.
      return fallback;
    }
  }

  /** Clé Redis de blacklist d'un citoyen. */
  private blacklistKey(citizenId: string): string {
    return `blacklist:${citizenId}`;
  }

  /**
   * Construit et publie un job de notification SMS (best-effort). Ne lève jamais :
   * une indisponibilité du bus de notifications ne doit pas casser l'opération
   * métier. L'idempotence est assurée côté notification-service via la clé.
   */
  private async notify(
    row: AppointmentRow,
    template: string,
    idempotencyKey: string,
    variables: Record<string, string | number>,
  ): Promise<void> {
    const phone = row.citizen.phoneNumber;
    if (!phone) {
      this.logger.debug(
        `Pas de téléphone pour le citoyen ${row.citizenId} — SMS ${template} ignoré`,
      );
      return;
    }
    await this.publisher.publish({
      recipient: phone,
      channel: 'sms',
      template,
      variables,
      priority: row.priority,
      language: row.citizen.preferredLanguage,
      recipientCitizenId: row.citizenId,
      idempotencyKey,
    });
  }

  /** Projette une ligne en vue publique. */
  private toView(row: AppointmentRow): AppointmentView {
    return {
      id: row.id,
      citizenId: row.citizenId,
      citizenName: `${row.citizen.firstName} ${row.citizen.lastName}`,
      centerId: row.centerId,
      centerName: row.center.name,
      status: row.status,
      priority: row.priority,
      purpose: row.purpose,
      scheduledAt: row.scheduledAt.toISOString(),
      queueNumber: row.queueNumber,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
