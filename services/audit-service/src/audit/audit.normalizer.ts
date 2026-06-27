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
 *              §9.4 — ORIGINE AUTHENTIFIÉE : l'`actorType`/`source` DÉCLARÉ dans
 *              le corps est forgeable. On scelle donc aussi, sous
 *              `newValue._meta.origin`, l'ÉMETTEUR RÉEL (résolu au niveau broker
 *              par le consumer : `appId`/`x-nina-source`) à côté de la source
 *              déclarée. Le `payloadHash` couvrant `_meta`, toute attribution
 *              mensongère (émetteur réel ≠ acteur déclaré) devient DÉTECTABLE a
 *              posteriori, même si elle n'est pas bloquée à l'émission.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';
import { VAULT_CLIENT } from '../vault/vault.module.js';
import { sha256Hex, type AuditChainFields } from './chain.js';
import { hashCorrelationId, isSensitiveRoute, truncateIp } from './anonymize.js';

/** Forme du secret KV attendu dans Vault pour le pepper de corrélation. */
interface AuditPepperSecret extends Record<string, unknown> {
  pepper: string;
}

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
  /**
   * Émetteur RÉEL au niveau broker (propriété AMQP `appId` ou en-tête
   * `x-nina-source`), résolu par le consumer. Non falsifiable par le CORPS du
   * message — sert à tracer l'origine authentifiée (§9.4) indépendamment de
   * l'`actorType`/`source` DÉCLARÉ dans le payload.
   */
  emitter?: string | null;
}

/** Regex IPv4/IPv6 simplifiée (validation `INET`, sinon `null`). */
const IP_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]+)$/;

@Injectable()
export class AuditNormalizer implements OnModuleInit {
  private readonly logger = new Logger(AuditNormalizer.name);
  /** Préfixes de routing sensibles (lanceurs d'alerte / SIGAC). */
  private readonly sensitivePrefixes: string[];
  /** Anonymisation forcée sur TOUS les événements (recommandé en prod). */
  private readonly anonymizeAll: boolean;
  /**
   * Poivre serveur du hachage de corrélation (jamais journalisé). Chargé depuis
   * Vault au boot (`onModuleInit`) ; vide tant que `loadPepper` n'a pas réussi.
   */
  private correlationPepper = '';

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    @Inject(VAULT_CLIENT) private readonly vault: VaultClient,
  ) {
    this.sensitivePrefixes = cfg
      .get('AUDIT_SENSITIVE_ROUTE_PREFIXES', { infer: true })
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    this.anonymizeAll = cfg.get('AUDIT_ANONYMIZE_ALL', { infer: true });
  }

  /** Charge le pepper de corrélation au démarrage (Vault → repli env → dev). */
  async onModuleInit(): Promise<void> {
    await this.loadPepper();
  }

  /**
   * Charge le poivre (pepper) de corrélation. Ordre de résolution :
   *   1. Vault KV (`VAULT_AUDIT_PEPPER_PATH`) — source de vérité, comme la clé
   *      Ed25519 (cf. `signing.service.ts`). NE JAMAIS journaliser la valeur.
   *   2. Repli `AUDIT_CORRELATION_PEPPER` (env) si Vault est indisponible.
   *   3. En dev/test uniquement : pepper ÉPHÉMÈRE aléatoire (le hachage reste
   *      déterministe sur la durée du process, non opposable hors-pepper).
   *
   * 🔒 FAIL-FAST PRODUCTION (THREAT-MODEL #12) : en `NODE_ENV=production`, si ni
   * Vault ni le repli env ne fournissent un pepper utilisable, le service REFUSE
   * de démarrer — un pepper absent/connu permettrait la désanonymisation d'un
   * lanceur d'alerte par dictionnaire d'UUID.
   *
   * @throws Error en production si aucun pepper sûr n'est disponible.
   */
  private async loadPepper(): Promise<void> {
    const path = this.cfg.get('VAULT_AUDIT_PEPPER_PATH', { infer: true });
    const isProd = this.cfg.get('NODE_ENV', { infer: true }) === 'production';
    try {
      const secret = await this.vault.getSecret<AuditPepperSecret>(path);
      if (typeof secret?.pepper !== 'string' || secret.pepper.trim().length === 0) {
        throw new Error('secret incomplet (champ `pepper` manquant/vide)');
      }
      this.correlationPepper = secret.pepper;
      this.logger.log('Pepper de corrélation chargé depuis Vault.');
      return;
    } catch (err) {
      const envPepper = this.cfg.get('AUDIT_CORRELATION_PEPPER', { infer: true });
      if (envPepper && envPepper.trim().length > 0) {
        this.correlationPepper = envPepper;
        this.logger.warn(
          `Pepper Vault indisponible (${(err as Error).message}) — repli sur AUDIT_CORRELATION_PEPPER (env).`,
        );
        return;
      }
      // En production : refuser de démarrer plutôt que de hacher avec un pepper
      // absent (désanonymisation possible). Pas de fallback silencieux.
      if (isProd) {
        throw new Error(
          `Pepper de corrélation indisponible en production (${(err as Error).message}). ` +
            `Bootstrap Vault requis (chemin '${path}') ou AUDIT_CORRELATION_PEPPER. Refus de démarrer.`,
          { cause: err },
        );
      }
      // Dev/test : pepper éphémère aléatoire (jamais codé en dur).
      this.correlationPepper = randomBytes(32).toString('hex');
      this.logger.warn(
        `Pepper Vault indisponible (${(err as Error).message}) et aucun repli env — ` +
          `génération d'un pepper ÉPHÉMÈRE (DEV uniquement, non persistant).`,
      );
    }
  }

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
    const ipValidated = ipRaw && IP_RE.test(ipRaw) ? ipRaw : null;

    const correlationRaw = this.truncate(
      this.str(b.correlationId) ??
        this.str(ctx.headers?.['x-correlation-id']) ??
        this.str(b.eventId) ??
        ctx.messageId ??
        null,
      100,
    );

    // §12 THREAT-MODEL — Anti-désanonymisation : sur le chemin lanceur d'alerte /
    // SIGAC (ou partout si AUDIT_ANONYMIZE_ALL), on TRONQUE l'IP (host masqué,
    // INET valide) et on HACHE le correlationId (corrélation SOC préservée, valeur
    // brute non exposée). Voir anonymize.ts.
    const anonymize = this.anonymizeAll || isSensitiveRoute(ctx.routingKey, this.sensitivePrefixes);
    const ipAddress = anonymize ? truncateIp(ipValidated) : ipValidated;
    const correlationId = anonymize
      ? hashCorrelationId(correlationRaw, this.correlationPepper)
      : correlationRaw;

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
    const businessValue = b.newValue ?? (b.payload !== undefined ? b.payload : body) ?? null;

    // §9.4 — On scelle l'ORIGINE AUTHENTIFIÉE (émetteur broker réel) ET l'acteur
    // DÉCLARÉ dans le corps, distinctement, sous `_meta`. L'`actorType` de la
    // colonne reste la valeur déclarée (rétro-compatible) mais devient
    // VÉRIFIABLE a posteriori : le payloadHash couvre `_meta`, donc une
    // attribution mensongère (émetteur ≠ acteur déclaré) est détectable.
    const newValue = this.withOriginMeta(businessValue, {
      emitter: ctx.emitter ?? null, // origine authentifiée (appId/x-nina-source)
      declaredSource: this.str(b.source) ?? this.str(b.actorType) ?? null,
      routingKey: ctx.routingKey,
    });
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

  /**
   * Enrobe la valeur métier d'un bloc `_meta` d'origine authentifiée sans écraser
   * un éventuel `_meta` métier. Le résultat est couvert par le `payloadHash`
   * (donc l'origine réelle est scellée et opposable). Si la valeur métier n'est
   * pas un objet (scalaire/tableau), on la préserve sous `_value`.
   */
  private withOriginMeta(
    value: unknown,
    origin: { emitter: string | null; declaredSource: string | null; routingKey: string },
  ): Record<string, unknown> {
    const base: Record<string, unknown> =
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : { _value: value ?? null };
    const existingMeta = this.asRecord(base['_meta']);
    base['_meta'] = { ...existingMeta, origin };
    return base;
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
