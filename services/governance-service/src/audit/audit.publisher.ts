/**
 * @file        audit.publisher.ts
 * @description Producteur RabbitMQ : publie les événements d'audit du
 *              governance-service vers l'exchange topic `nina.events` (consommé
 *              par audit-service, qui les chaîne dans la hash-chain SHA-256 —
 *              doc 09, PAS un arbre de Merkle).
 *
 *              Contrat de message aligné sur identity-service / vulnerability-
 *              service (`DomainEvent`) : `{ eventType, eventId, timestamp,
 *              source, actorId?, payload }`. Le `payload` est conforme au DTO
 *              d'ingestion réel de l'audit-service
 *              (`action/entityType/entityId/userId/actorType/ipAddress/newValue`)
 *              — `ValidationPipe` `forbidNonWhitelisted: true` ⇒ toute clé hors
 *              contrat déclenche une 400. On range donc la métadonnée métier dans
 *              `newValue` (seul champ JSON libre hashé).
 *
 *              ⚠️ Le SGOGT est institutionnel (PAS de NINA). L'export électoral
 *              est pseudonymisé : on ne journalise JAMAIS de NINA ni de `body`
 *              en clair — uniquement des métadonnées de décision/exfiltration.
 *
 *              DEUX NIVEAUX :
 *                - `publish()` (best-effort) : un échec n'interrompt PAS
 *                  l'opération métier (RabbitMQ ≠ source de vérité).
 *                - `recordExport()` (DURABLE, fail-on-no-trace) : pour CHAQUE
 *                  export DGE, la trace est écrite EN BASE (`ElectoralExportLog`)
 *                  AVANT relais best-effort. Si l'écriture durable échoue, on
 *                  PROPAGE l'erreur (l'export doit échouer) : invariant
 *                  « pas d'export sans trace ».
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/audit
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '@nina-aes/database';
import type { Channel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Env } from '../config/env.schema.js';
import { RabbitConnection } from './rabbit.connection.js';

/** Identité broker de ce publisher (tracée par audit-service `_meta.origin`). */
const SOURCE = 'governance-service';

/** Actions d'audit du domaine gouvernance (routing key = `governance.<x>`). */
export const AuditAction = {
  /** Message SGOGT signé envoyé. */
  SGOGT_MESSAGE_SENT: 'sgogt.message_sent',
  /** Message SGOGT lu (ACK signé). */
  SGOGT_MESSAGE_READ: 'sgogt.message_read',
  /** Message SGOGT répondu. */
  SGOGT_MESSAGE_RESPONDED: 'sgogt.message_responded',
  /** Escalade automatique après TTL. */
  SGOGT_MESSAGE_ESCALATED: 'sgogt.message_escalated',
  /** Directive Kanban créée / transition de cycle de vie. */
  GOVERNANCE_TASK_TRANSITIONED: 'governance.task_transitioned',
  /** Inscription électorale automatique à 18 ans. */
  VOTER_INSCRIBED_AUTO_18: 'elections.voter_inscribed_auto18',
  /** Export delta DGE (obligatoire — détection d'un compte compromis). */
  DGE_EXPORT: 'elections.dge_export',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Données d'un événement d'audit. */
export interface AuditEvent {
  /** Action métier (cf. {@link AuditAction}) — devient la routing key suffixe. */
  action: AuditAction;
  /** Type d'entité affectée (ex. `SgogtSignedMessage`). */
  entityType: string;
  /** Identifiant de l'entité (UUID — JAMAIS le NINA). */
  entityId: string;
  /** Acteur authentifié (User.id / sub JWT). `null` pour une origine système (cron). */
  actorId?: string | null;
  /** Type/origine de l'acteur (ex. `official`, `system:inscription-auto-cron`). */
  actorType?: string;
  /** Adresse IP source. */
  ipAddress?: string | null;
  /** Métadonnée métier libre (SANS NINA / body en clair). */
  metadata?: Record<string, unknown>;
}

/** Enveloppe d'événement publiée (alignée identity-service `DomainEvent`). */
interface DomainEvent {
  eventType: string;
  eventId: string;
  timestamp: string;
  source: typeof SOURCE;
  actorId?: string;
  payload: Record<string, unknown>;
}

/** Métadonnée durable d'un export DGE (trace locale `ElectoralExportLog`). */
export interface ExportTrace {
  accountId: string;
  sinceIso: string;
  rowCount: number;
  sha256: string;
  saltVersion: number;
  ipAddress?: string | null;
}

@Injectable()
export class AuditPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuditPublisher.name);
  private readonly exchange: string;
  private channel: ChannelWrapper | null = null;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly connection: RabbitConnection,
  ) {
    this.exchange = cfg.get('RABBITMQ_EVENTS_EXCHANGE', { infer: true });
  }

  /** Crée le canal de publication + déclare l'exchange (idempotent). */
  onModuleInit(): void {
    if (!this.connection.isEnabled()) {
      this.logger.warn('Publisher audit désactivé (événements non publiés)');
      return;
    }
    this.channel = this.connection.get().createChannel({
      json: false,
      setup: (ch: Channel) => ch.assertExchange(this.exchange, 'topic', { durable: true }),
    });
  }

  /** Indique si le publisher est prêt (canal disponible). */
  isReady(): boolean {
    return this.channel !== null;
  }

  /**
   * Publie un événement d'audit. Best-effort : si RabbitMQ est indisponible, on
   * journalise et on renvoie `false` SANS faire échouer l'opération métier.
   *
   * @param ev Événement d'audit (SANS NINA / body en clair dans `metadata`).
   * @returns `true` si publié, `false` si désactivé/indisponible.
   */
  async publish(ev: AuditEvent): Promise<boolean> {
    if (!this.channel) return false;
    const eventId = randomUUID();
    const routingKey = `governance.${ev.action}`;
    const event: DomainEvent = {
      eventType: routingKey,
      eventId,
      timestamp: new Date().toISOString(),
      source: SOURCE,
      ...(ev.actorId ? { actorId: ev.actorId } : {}),
      payload: {
        action: ev.action,
        entityType: ev.entityType,
        entityId: ev.entityId,
        actorType: ev.actorType ?? 'service',
        ...(ev.actorId ? { userId: ev.actorId } : {}),
        ...(ev.ipAddress ? { ipAddress: ev.ipAddress } : {}),
        ...(ev.metadata ? { newValue: ev.metadata } : {}),
      },
    };
    try {
      await this.channel.publish(
        this.exchange,
        routingKey,
        Buffer.from(JSON.stringify(event), 'utf8'),
        {
          persistent: true,
          contentType: 'application/json',
          messageId: eventId,
          timestamp: Date.now(),
          appId: SOURCE,
          headers: { 'x-source': SOURCE, 'x-nina-source': SOURCE, 'x-version': '1' },
        },
      );
      return true;
    } catch (err) {
      this.logger.warn(`Publication audit impossible (${ev.action}) : ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Journalise un export DGE de manière DURABLE (table `ElectoralExportLog`)
   * AVANT relais best-effort vers la hash-chain d'audit-service. C'est ce qui
   * rend un compte DGE compromis détectable (qui / quand / fenêtre / nb lignes /
   * sha256 / IP). Contrat fail-closed : si l'écriture durable échoue, on PROPAGE
   * l'erreur — l'export NE DOIT PAS aboutir sans trace.
   *
   * @param trace Métadonnée d'exfiltration (sans PII directe).
   * @throws Si la persistance durable échoue (pas d'export sans trace).
   */
  async recordExport(trace: ExportTrace): Promise<void> {
    // 1) Trace DURABLE en base (source de vérité de la traçabilité d'export).
    await prisma.electoralExportLog.create({
      data: {
        accountId: trace.accountId,
        sinceIso: trace.sinceIso,
        rowCount: trace.rowCount,
        sha256: trace.sha256,
        saltVersion: trace.saltVersion,
        ipAddress: trace.ipAddress ?? null,
      },
      select: { id: true },
    });

    // 2) Relais best-effort vers la hash-chain d'audit-service (RabbitMQ).
    await this.publish({
      action: AuditAction.DGE_EXPORT,
      entityType: 'ElectoralPseudonym',
      entityId: `export:${trace.sinceIso}`,
      actorId: trace.accountId,
      actorType: 'dge_official',
      ipAddress: trace.ipAddress,
      metadata: { since: trace.sinceIso, count: trace.rowCount, sha256: trace.sha256 },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
  }
}
