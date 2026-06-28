/**
 * @file        audit.publisher.ts
 * @description Producteur RabbitMQ : publie les événements d'audit du
 *              biometric-service vers l'exchange topic `nina.events` (consommé par
 *              audit-service, qui les chaîne dans la hash-chain SHA-256 — doc 09 /
 *              ADR-007, PAS un arbre de Merkle). CHAQUE opération biométrique est
 *              tracée (doc 25 §4.8 : « Audit Merkle de toute opération : 100 % »).
 *
 *              ⚠️  DONNÉE SENSIBLE — on ne met JAMAIS dans le `payload` :
 *                - le NINA en clair (UUID `citizenId` uniquement) ;
 *                - un template (même protégé) ni le paramètre cancelable ;
 *                - une image brute / un vecteur de features clair.
 *              Uniquement des RÉFÉRENCES (kind, transform_kid, compteurs, jti).
 *
 *              DEUX NIVEAUX DE GARANTIE (aligné vulnerability-service) :
 *                - `publish()` (best-effort) : un échec n'interrompt PAS
 *                  l'opération métier déjà persistée (RabbitMQ ≠ source de vérité).
 *                - `recordAccess()` (DURABLE, fail-on-no-trace) : la trace est
 *                  écrite EN BASE (`BiometricAccessLog`) AVANT de renvoyer le
 *                  résultat, PUIS relayée best-effort vers RabbitMQ. Si l'écriture
 *                  durable échoue, on PROPAGE l'erreur (la requête échoue 5xx) :
 *                  invariant « pas d'opération biométrique sans trace ».
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/audit
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@nina-aes/database';
import type { Channel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Env } from '../config/env.schema.js';
import { RabbitConnection } from './rabbit.connection.js';

/** Identité broker de ce publisher (tracée par audit-service `_meta.origin`). */
const SOURCE = 'biometric-service';

/** Actions d'audit biométrique (routing key = `biometric.<x>`). */
export const AuditAction = {
  /** Consentement JWS vérifié et accepté (chaîne de confiance ancrée). */
  CONSENT_VERIFIED: 'consent_verified',
  /** Consentement retiré par le citoyen (déclenche l'effacement). */
  CONSENT_REVOKED: 'consent_revoked',
  /** Template protégé enrôlé (jamais d'image, jamais de template clair). */
  REGISTERED: 'registered',
  /** Vérification 1:1 réussie (distance ≤ τ). */
  VERIFY_SUCCESS: 'verify_success',
  /** Vérification 1:1 échouée (aucun template sous le seuil). */
  VERIFY_FAIL: 'verify_fail',
  /** Verrouillage anti-bruteforce déclenché (rafale d'échecs). */
  VERIFY_LOCKED: 'verify_locked',
  /** Recherche 1:N restreinte (P3c, INSPECTOR + 4-yeux). */
  IDENTIFY_QUERIED: 'identify_queried',
  /** Effacement des templates d'un citoyen (droit à l'effacement). */
  TEMPLATES_ERASED: 'templates_erased',
  /** Révocation logique de templates (rotation/incident). */
  TEMPLATE_REVOKED: 'template_revoked',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Données d'un événement d'audit biométrique. */
export interface AuditEvent {
  /** Action métier (cf. {@link AuditAction}) — devient la routing key suffixe. */
  action: AuditAction;
  /** Type d'entité affectée (ex. `BiometricTemplate`). */
  entityType: string;
  /** Identifiant de l'entité (UUID citoyen / id template — JAMAIS le NINA). */
  entityId: string;
  /** Acteur authentifié (User.id / sub JWT). `null` pour une origine système. */
  actorId?: string | null;
  /** Type/origine de l'acteur (ex. `biometric_operator`, `inspector`). */
  actorType?: string;
  /** Adresse IP source. */
  ipAddress?: string | null;
  /** Métadonnée métier libre (SANS NINA, SANS template, SANS paramètre). */
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
   * @param ev Événement d'audit (SANS NINA / template / paramètre dans `metadata`).
   * @returns `true` si publié, `false` si désactivé/indisponible.
   */
  async publish(ev: AuditEvent): Promise<boolean> {
    if (!this.channel) return false;
    const eventId = randomUUID();
    const event: DomainEvent = {
      eventType: `biometric.${ev.action}`,
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
        `biometric.${ev.action}`,
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
   * Journalise une opération biométrique de manière DURABLE (table
   * `BiometricAccessLog`) AVANT relais best-effort vers RabbitMQ. C'est le chemin
   * OBLIGATOIRE pour toute opération biométrique (enrôlement, vérification,
   * identification) : la trace en base est la garantie « pas d'opération sans
   * trace », indépendante de la disponibilité du broker (doc 25 §4.8).
   *
   * Contrat fail-closed : si l'écriture durable échoue, on PROPAGE l'erreur —
   * l'appelant NE DOIT PAS renvoyer le résultat (la requête échoue 5xx).
   *
   * @param ev Événement d'audit (SANS NINA / template / paramètre).
   * @throws Si la persistance durable de la trace échoue.
   */
  async recordAccess(ev: AuditEvent): Promise<void> {
    // 1) Trace DURABLE en base (source de vérité de la traçabilité biométrique).
    const log = await prisma.biometricAccessLog.create({
      data: {
        action: ev.action,
        entityType: ev.entityType,
        entityId: ev.entityId,
        actorId: ev.actorId ?? null,
        actorType: ev.actorType ?? 'service',
        ipAddress: ev.ipAddress ?? null,
        ...(ev.metadata ? { metadata: ev.metadata as Prisma.InputJsonValue } : {}),
      },
      select: { id: true },
    });

    // 2) Relais best-effort vers la hash-chain d'audit-service (RabbitMQ).
    const relayed = await this.publish(ev);
    if (relayed) {
      await prisma.biometricAccessLog
        .update({ where: { id: log.id }, data: { relayed: true } })
        .catch((err: unknown) => {
          this.logger.warn(`Marquage relayed impossible (${log.id}) : ${(err as Error).message}`);
        });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
  }
}
