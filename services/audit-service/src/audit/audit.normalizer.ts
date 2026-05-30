/**
 * @file        audit.normalizer.ts
 * @description Normalise les messages AMQP hétérogènes en un événement d'audit
 *              canonique. La plateforme a plusieurs conventions d'enveloppe :
 *
 *                - identity-service : { eventType, eventId, timestamp, source,
 *                                       actorId?, payload }
 *                - document-service : { ...payload, source, emittedAt }   (plat)
 *                - ingestion directe : { sourceEventId?, action, entityType?, … }
 *
 *              On en extrait un sous-ensemble robuste, mappé sur les colonnes
 *              réelles de `audit_logs` (cf. packages/database/prisma/schema).
 *
 *              ⚠️  Contrainte FK : `audit_logs.user_id` référence `users(id)`.
 *              Un événement peut référencer un acteur citoyen/externe absent de
 *              `users` → pour ne JAMAIS perdre un événement sur une violation de
 *              clé étrangère, `userId` reste `null` côté AMQP ; l'acteur brut est
 *              préservé dans `newValue` (et donc couvert par le `payloadHash`).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable } from '@nestjs/common';
import { sha256Hex, type AuditChainFields } from './chain.js';

/** Événement d'audit normalisé prêt à être chaîné/inséré. */
export interface NormalizedAuditEvent extends AuditChainFields {
  occurredAt: Date;
}

/** Contexte AMQP accompagnant le corps du message. */
export interface AmqpContext {
  routingKey: string;
  messageId?: string;
  timestampMs?: number;
  headers?: Record<string, unknown>;
}

/** Regex IPv4/IPv6 simplifiée (validation `INET`, sinon `null`). */
const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]+)$/;

@Injectable()
export class AuditNormalizer {
  /**
   * Normalise un corps de message + son contexte AMQP en événement d'audit.
   *
   * @param body Corps JSON déjà parsé (objet quelconque).
   * @param ctx  Métadonnées AMQP (routing key, messageId, headers, timestamp).
   */
  normalize(body: unknown, ctx: AmqpContext): NormalizedAuditEvent {
    const b = this.asRecord(body);
    const inner = this.asRecord(b.payload); // enveloppe identity-service

    const action = this.truncate(
      this.str(b.action) ?? this.str(b.eventType) ?? ctx.routingKey ?? 'unknown',
      100,
    );
    const actorType = this.truncate(this.str(b.actorType) ?? this.str(b.source) ?? 'SYSTEM', 30);
    const entityType = this.truncate(
      this.str(b.entityType) ?? this.firstSegment(ctx.routingKey) ?? 'event',
      80,
    );
    const entityId = this.truncate(
      this.str(b.entityId) ??
        this.str(b.id) ??
        this.str(inner.id) ??
        this.str(b.nina) ??
        this.str(inner.nina) ??
        null,
      100,
    );

    const ipRaw = this.str(b.ipAddress);
    const ipAddress = ipRaw && IP_RE.test(ipRaw) ? ipRaw : null;

    const correlationId = this.truncate(
      this.str(b.correlationId) ??
        this.str(ctx.headers?.['x-correlation-id']) ??
        this.str(b.eventId) ??
        ctx.messageId ??
        null,
      100,
    );

    const occurredAt =
      this.parseDate(b.occurredAt) ??
      this.parseDate(b.emittedAt) ??
      this.parseDate(b.timestamp) ??
      (ctx.timestampMs ? new Date(ctx.timestampMs) : null) ??
      new Date();

    const sourceEventId = this.truncate(
      this.str(b.sourceEventId) ??
        this.str(b.eventId) ??
        ctx.messageId ??
        // Repli déterministe : stable au redelivery (idempotence), distinct par
        // événement réel car l'enveloppe embarque emittedAt/timestamp.
        sha256Hex(`${ctx.routingKey}|${this.stableStringify(body)}`),
      100,
    );

    // newValue = contenu métier « ce qui s'est passé » (préserve l'acteur brut).
    const newValue = b.newValue ?? (b.payload !== undefined ? b.payload : body) ?? null;
    const oldValue = b.oldValue ?? null;

    return {
      userId: null,
      actorType,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ipAddress,
      correlationId,
      sourceEventId,
      occurredAt,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private asRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  private str(v: unknown): string | null {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return null;
  }

  private truncate(v: string, max: number): string;
  private truncate(v: string | null, max: number): string | null;
  private truncate(v: string | null, max: number): string | null {
    if (v === null) return null;
    return v.length > max ? v.slice(0, max) : v;
  }

  private firstSegment(routingKey: string): string | null {
    const seg = routingKey?.split('.')[0];
    return seg && seg.length > 0 ? seg : null;
  }

  private parseDate(v: unknown): Date | null {
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  /** JSON stable (clés triées) pour un hash de repli déterministe. */
  private stableStringify(v: unknown): string {
    const seen = new Set<unknown>();
    const norm = (x: unknown): unknown => {
      if (x && typeof x === 'object') {
        if (seen.has(x)) return null;
        seen.add(x);
        if (Array.isArray(x)) return x.map(norm);
        const obj = x as Record<string, unknown>;
        return Object.keys(obj)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = norm(obj[k]);
            return acc;
          }, {});
      }
      return x;
    };
    try {
      return JSON.stringify(norm(v));
    } catch {
      return String(v);
    }
  }
}
