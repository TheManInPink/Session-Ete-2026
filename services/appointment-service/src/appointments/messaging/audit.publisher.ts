/**
 * @file        audit.publisher.ts
 * @description Producteur RabbitMQ : publie les événements d'AUDIT du
 *              appointment-service (prise / annulation de RDV self-service PC-04)
 *              vers l'exchange topic `nina.events` (consommé par audit-service,
 *              qui les chaîne dans la hash-chain SHA-256 — doc 09).
 *
 *              Contrat de message aligné sur les autres publishers du dépôt
 *              (identity/vulnerability : `DomainEvent`) : champs d'audit AU
 *              NIVEAU RACINE (`action / entityType / entityId / actorType / …`),
 *              en-têtes `appId` + `x-nina-source` (origine tracée par le consumer
 *              audit), routing key `appointment.<action>` — captée par le pattern
 *              `appointment.#` déjà présent dans `AUDIT_EVENT_PATTERNS`.
 *
 *              ⚠️  Le normalizer d'audit-service lit `entityType / entityId /
 *              action / actorType / ipAddress` à la RACINE du corps (`b.*`), PAS
 *              sous `payload` — les y nicher ferait tomber `entity_id` à NULL. On
 *              les émet donc à la racine ; `payload` = contexte métier libre
 *              (repris comme `newValue` côté audit).
 *
 *              ⚠️  Donnée sensible : le NINA n'apparaît JAMAIS dans l'événement.
 *              L'acteur (le citoyen) et l'entité (le RDV) sont identifiés par
 *              leurs UUID.
 *
 *              SIGNATURE D'ORIGINE : la signature Ed25519 de message
 *              (`x-nina-signature`) reste un chantier PLATE-FORME (Phase 2) —
 *              aucun publisher ne signe encore, `AUDIT_PUBLISHER_KEYS` est vide et
 *              audit-service accepte l'origine via la confiance canal en dev
 *              (`AUDIT_REQUIRE_SIGNED_ORIGIN=false`). Ce publisher est PRÊT à être
 *              signé (émetteur résolvable via `appId`) : l'activation exige de
 *              provisionner la paire de clés et d'enregistrer la clé publique
 *              `appointment-service:<hex>` côté audit-service.
 *
 *              Best-effort : un échec de publication n'interrompt PAS l'opération
 *              métier (le RDV est déjà persisté — PostgreSQL reste la source de
 *              vérité). Réutilise la connexion RabbitMQ partagée
 *              ({@link RabbitConnection}) : sa disponibilité est gouvernée par
 *              `APPOINTMENT_NOTIFICATIONS_ENABLED`, et la publication d'audit par
 *              `APPOINTMENT_AUDIT_ENABLED` (les deux OFF en test/CI).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments/messaging
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Channel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Env } from '../../config/env.schema.js';
import { RabbitConnection } from './rabbit.connection.js';

/** Identité broker de ce publisher (émetteur tracé par audit-service). */
const SOURCE = 'appointment-service';

/** Actions d'audit du domaine RDV (routing key = `appointment.<action>`). */
export const AuditAction = {
  /** RDV créé en self-service par le citoyen (PC-04). */
  BOOKING_CREATED: 'booking.created',
  /** RDV annulé en self-service par le citoyen. */
  BOOKING_CANCELLED: 'booking.cancelled',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Données d'un événement d'audit (SANS NINA en clair dans `metadata`). */
export interface AuditEvent {
  /** Action métier (cf. {@link AuditAction}) — devient le suffixe de routing key. */
  action: AuditAction;
  /** Type d'entité affectée (ex. `Appointment`). */
  entityType: string;
  /** Identifiant de l'entité — UUID, JAMAIS le NINA. */
  entityId: string;
  /** Acteur (Citizen.id / User.id). `null` pour une origine système. */
  actorId?: string | null;
  /** Origine de l'acteur (ex. `citizen`, `agent`, `system:cron`). */
  actorType?: string;
  /** Adresse IP source. */
  ipAddress?: string | null;
  /** Contexte métier libre (SANS NINA en clair). */
  metadata?: Record<string, unknown>;
}

/**
 * Enveloppe publiée : base alignée identity-service `DomainEvent`
 * (`eventType / eventId / timestamp / source`), ÉTENDUE avec les champs d'audit
 * AU NIVEAU RACINE (lus par `audit.normalizer`). `payload` reste le contexte
 * métier (repris comme `newValue` côté audit).
 */
interface DomainEvent {
  eventType: string;
  eventId: string;
  timestamp: string;
  source: typeof SOURCE;
  /** Action métier (lue en racine par le normalizer : `b.action`). */
  action: string;
  /** Type d'entité (lu en racine : `b.entityType`). */
  entityType: string;
  /** Identifiant d'entité — UUID, JAMAIS le NINA (lu en racine : `b.entityId`). */
  entityId: string;
  /** Origine de l'acteur (lue en racine : `b.actorType`). */
  actorType: string;
  /** Acteur (Citizen.id / sub) — dupliqué pour la lisibilité aval. */
  actorId?: string;
  userId?: string;
  /** IP source (lue en racine : `b.ipAddress`). */
  ipAddress?: string;
  /** Contexte métier libre (SANS NINA) — devient `newValue` côté audit. */
  payload: Record<string, unknown>;
}

@Injectable()
export class AuditPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuditPublisher.name);
  private readonly exchange: string;
  private readonly enabled: boolean;
  private channel: ChannelWrapper | null = null;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly connection: RabbitConnection,
  ) {
    this.exchange = cfg.get('RABBITMQ_EVENTS_EXCHANGE', { infer: true });
    this.enabled = cfg.get('APPOINTMENT_AUDIT_ENABLED', { infer: true });
  }

  /** Crée le canal de publication + déclare l'exchange (idempotent). */
  onModuleInit(): void {
    if (!this.enabled || !this.connection.isEnabled()) {
      this.logger.warn('Publisher audit désactivé (événements de RDV non publiés)');
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
   * @param ev Événement d'audit (SANS NINA en clair dans `metadata`).
   * @returns `true` si publié, `false` si désactivé/indisponible.
   */
  async publish(ev: AuditEvent): Promise<boolean> {
    if (!this.channel) return false;
    const eventId = randomUUID();
    const routingKey = `appointment.${ev.action}`;
    const event: DomainEvent = {
      eventType: routingKey,
      eventId,
      timestamp: new Date().toISOString(),
      source: SOURCE,
      // Champs d'audit AU NIVEAU RACINE (lus par le normalizer audit-service).
      action: ev.action,
      entityType: ev.entityType,
      entityId: ev.entityId,
      actorType: ev.actorType ?? 'service',
      ...(ev.actorId ? { actorId: ev.actorId, userId: ev.actorId } : {}),
      ...(ev.ipAddress ? { ipAddress: ev.ipAddress } : {}),
      // Contexte métier (SANS NINA en clair) — repris comme `newValue` côté audit.
      payload: ev.metadata ?? {},
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

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
  }
}
