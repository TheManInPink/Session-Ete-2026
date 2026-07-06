/**
 * @file        audit.consumer.ts
 * @description Consumer RabbitMQ (amqp-connection-manager : reconnexion auto).
 *
 *              Topologie consommée (auto-assertée, idempotente) :
 *                - exchange fanout `RABBITMQ_AUDIT_EXCHANGE` (défaut nina.audit)
 *                  → audit explicite.
 *                - exchange topic  `RABBITMQ_EVENTS_EXCHANGE` (défaut nina.events)
 *                  → événements métier, liés via `AUDIT_EVENT_PATTERNS`
 *                    (citizen.#, correction.#, governance.#, document.#, …).
 *
 *              Chaque message est normalisé puis empilé dans `AuditBatcher`.
 *              ACK différé après insertion (livraison at-least-once + idempotence
 *              via `source_event_id UNIQUE`). Un message non-JSON / non
 *              normalisable est ACK + droppé (pas de boucle de poison).
 *
 *              Réconciliation des publishers (drift résolu, cf. CHANGELOG 0vicies) :
 *              document-service et identity-service publient désormais tous deux sur
 *              `nina.events` (clés `document.*` / `citizen.*` / `correction.*`), captées
 *              ici par `AUDIT_EVENT_PATTERNS`. (Auparavant : `audit.events` et
 *              `nina-aes.events` respectivement — exchanges orphelins non consommés.)
 *
 *              ── AUTHENTIFICATION DE L'ORIGINE (anti-falsification d'acteur, §9.4) ──
 *              Un événement consommé ne doit PAS pouvoir usurper l'acteur. Deux
 *              lignes de défense (ADR-034) :
 *                1. CANAL (transport) — mTLS strict Linkerd entre services et le
 *                   broker : seuls les pods du mesh peuvent publier. ⏳ INFRA
 *                   (hors code ; hypothèse de confiance THREAT-MODEL §1.2).
 *                2. MESSAGE (bout-en-bout) — `isOriginTrusted()` VÉRIFIE ici, AVANT
 *                   tout `append`, la signature détachée Ed25519 `x-nina-signature`
 *                   contre la clé publique du publisher (`AUDIT_PUBLISHER_KEYS`,
 *                   indexée par `appId`/`x-nina-source`). Signature invalide ou
 *                   émetteur signé inconnu ⇒ DROP. En l'absence de clé enregistrée,
 *                   la posture dépend de `AUDIT_REQUIRE_SIGNED_ORIGIN` :
 *                   fail-closed (drop, FORCÉ en production) ou fail-open borné
 *                   (accepté avec WARN, dev/transition seulement). L'émetteur RÉEL
 *                   (broker-level) est aussi scellé dans `newValue._meta` (couvert
 *                   par le `payloadHash`) → forge détectable a posteriori. La trace
 *                   `_meta.origin` n'est PAS une authentification ; l'`actorType`/
 *                   `userId` DÉCLARÉ dans le corps n'est jamais traité comme
 *                   authentifié.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ed from '@noble/ed25519';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { Env } from '../config/env.schema.js';
import { AuditBatcher } from './audit.batcher.js';
import { AuditNormalizer } from './audit.normalizer.js';

/** TTL de la queue audit (7 jours, aligné infrastructure/.../definitions.json). */
const AUDIT_QUEUE_TTL_MS = 604_800_000;

/**
 * En-têtes AMQP porteurs de l'identité du publisher (défense en profondeur
 * au-dessus du mTLS canal). Le broker positionne `appId` (propriété AMQP) ;
 * `x-nina-source` est un en-tête applicatif redondant (tolérance aux publishers
 * qui ne renseignent pas `appId`).
 */
const HEADER_SOURCE = 'x-nina-source';
/**
 * En-tête source legacy émis par identity-service (`rabbitmq.service.ts`).
 * Toléré comme repli pour ne pas casser les publishers actuels.
 */
const HEADER_SOURCE_LEGACY = 'x-source';
/** Signature détachée du corps par la clé du publisher (⏳ Phase 2, vérifiée si présente). */
const HEADER_SIGNATURE = 'x-nina-signature';

@Injectable()
export class AuditConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuditConsumer.name);
  private conn: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;

  /**
   * Si `true`, une signature publisher valide est EXIGÉE avant `append`
   * (fail-closed) ; sinon posture fail-open bornée (trace seule). Forcé à `true`
   * en production par `validateEnv` (cf. env.schema). §9.4.
   */
  private readonly requireSignedOrigin: boolean;
  /**
   * Clés publiques Ed25519 des publishers autorisés, indexées par identité
   * d'émetteur (`appId`/`x-nina-source`). Vide ⇒ aucune signature attendue.
   */
  private readonly publisherKeys: ReadonlyMap<string, Uint8Array>;

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    private readonly batcher: AuditBatcher,
    private readonly normalizer: AuditNormalizer,
  ) {
    this.requireSignedOrigin = cfg.get('AUDIT_REQUIRE_SIGNED_ORIGIN', { infer: true });
    this.publisherKeys = this.parsePublisherKeys(cfg.get('AUDIT_PUBLISHER_KEYS', { infer: true }));
  }

  /**
   * Parse la map `appId:publicKeyHex` (CSV) des clés publiques de publishers.
   * Une entrée invalide (hex non décodable / longueur ≠ 32 octets) est ignorée
   * avec un warning — on ne fait jamais confiance à une clé malformée.
   */
  private parsePublisherKeys(raw: string): ReadonlyMap<string, Uint8Array> {
    const map = new Map<string, Uint8Array>();
    for (const entry of raw
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0)) {
      const sep = entry.indexOf(':');
      const appId = sep > 0 ? entry.slice(0, sep).trim() : '';
      const hex = sep > 0 ? entry.slice(sep + 1).trim() : '';
      if (!appId || !/^[0-9a-fA-F]{64}$/.test(hex)) {
        this.logger.warn(`Clé publisher ignorée (format attendu appId:pubKeyHex 32 octets)`);
        continue;
      }
      map.set(appId, new Uint8Array(Buffer.from(hex, 'hex')));
    }
    return map;
  }

  /** Établit la connexion + déclare la topologie + démarre la consommation. */
  onModuleInit(): void {
    if (!this.cfg.get('RABBITMQ_CONSUMER_ENABLED', { infer: true })) {
      this.logger.warn('Consumer RabbitMQ désactivé (RABBITMQ_CONSUMER_ENABLED=false)');
      return;
    }

    const url = this.cfg.get('RABBITMQ_URL', { infer: true });
    const auditExchange = this.cfg.get('RABBITMQ_AUDIT_EXCHANGE', { infer: true });
    const eventsExchange = this.cfg.get('RABBITMQ_EVENTS_EXCHANGE', { infer: true });
    const queue = this.cfg.get('RABBITMQ_AUDIT_QUEUE', { infer: true });
    const prefetch = this.cfg.get('RABBITMQ_AUDIT_PREFETCH', { infer: true });
    const patterns = this.cfg
      .get('AUDIT_EVENT_PATTERNS', { infer: true })
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    this.conn = connect([url], { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 });
    this.conn.on('connect', () => this.logger.log(`RabbitMQ connecté (queue=${queue})`));
    this.conn.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ déconnecté : ${err?.message ?? 'inconnu'}`),
    );

    this.channel = this.conn.createChannel({
      setup: async (ch: Channel) => {
        await ch.assertExchange(auditExchange, 'fanout', { durable: true });
        await ch.assertExchange(eventsExchange, 'topic', { durable: true });
        await ch.assertQueue(queue, {
          durable: true,
          arguments: { 'x-message-ttl': AUDIT_QUEUE_TTL_MS },
        });
        await ch.bindQueue(queue, auditExchange, '');
        for (const pattern of patterns) {
          await ch.bindQueue(queue, eventsExchange, pattern);
        }
        await ch.prefetch(prefetch);
        await ch.consume(queue, (msg) => void this.handle(msg), { noAck: false });
        this.logger.log(
          `Topologie prête : ${auditExchange}(fanout) + ${eventsExchange}(topic ${patterns.length} patterns) → ${queue}`,
        );
      },
    });
  }

  /** Traite un message : authentifie l'origine → parse → normalise → empile (ACK différé). */
  private async handle(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;
    const channel = this.channel;

    // §9.4 — AUTHENTIFICATION DE L'ORIGINE (avant tout traitement). On résout
    // l'émetteur RÉEL au niveau broker (non falsifiable par le corps) puis on
    // vérifie sa signature détachée Ed25519 (`x-nina-signature`). Le verdict
    // conditionne la suite : en posture fail-closed, un message non authentifié
    // est DROPPÉ et n'atteint JAMAIS la chaîne.
    const emitter = this.extractEmitter(msg);
    if (!(await this.isOriginTrusted(msg, emitter))) {
      this.logger.warn(`Message rejeté : origine non authentifiée (rk=${msg.fields.routingKey})`);
      channel.ack(msg); // drop sans requeue (évite la boucle de poison)
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(msg.content.toString('utf8'));
    } catch {
      this.logger.warn(`Message non-JSON ignoré (rk=${msg.fields.routingKey})`);
      channel.ack(msg);
      return;
    }

    let event;
    try {
      const rawTs = msg.properties.timestamp ? Number(msg.properties.timestamp) : undefined;
      event = this.normalizer.normalize(body, {
        routingKey: msg.fields.routingKey,
        messageId: msg.properties.messageId ?? undefined,
        timestampMs: rawTs ? (rawTs < 1e12 ? rawTs * 1000 : rawTs) : undefined,
        headers: (msg.properties.headers ?? {}) as Record<string, unknown>,
        // Émetteur RÉEL au niveau broker (propriété AMQP `appId` ou en-tête
        // applicatif) — non falsifiable par le CORPS du message. Tracé et
        // couvert par le payloadHash (cf. normalizer `_meta.origin`).
        emitter,
      });
    } catch (err) {
      this.logger.warn(`Normalisation échouée, message droppé : ${(err as Error).message}`);
      channel.ack(msg);
      return;
    }

    this.batcher.enqueue({
      event,
      ack: () => channel.ack(msg),
      nack: () => channel.nack(msg, false, true), // requeue : retry transitoire
    });
  }

  /**
   * §9.4 — Origine de confiance. Modèle de confiance AS-BUILT à DEUX niveaux :
   *
   *  - CANAL (transport) : maillage mTLS strict (Linkerd, ADR-034 /
   *    THREAT-MODEL §1.2) — seuls les pods du mesh atteignent le broker.
   *    Garantie ⏳ INFRA (hors code de ce service).
   *  - MESSAGE (bout-en-bout, ICI) : on RÉSOUT l'émetteur broker réel
   *    (`appId`/`x-nina-source`) puis, si une clé publique est enregistrée pour
   *    lui (`AUDIT_PUBLISHER_KEYS`), on VÉRIFIE réellement la signature détachée
   *    Ed25519 `x-nina-signature` sur les octets du corps. L'émetteur réel est
   *    par ailleurs scellé dans `newValue._meta.origin` (couvert par le
   *    payloadHash) → toute attribution mensongère est aussi détectable a
   *    posteriori.
   *
   * Décision (verdict) :
   *  - Signature présente + clé connue + vérif OK  → ACCEPTÉ.
   *  - Signature présente mais invalide / émetteur inconnu → REJETÉ (toujours :
   *    une signature qui ne vérifie pas est une tentative de forge).
   *  - Aucune signature / aucune clé enregistrée → dépend de la posture :
   *      • `AUDIT_REQUIRE_SIGNED_ORIGIN=true` (FAIL-CLOSED, défaut prod) → REJETÉ.
   *      • sinon (FAIL-OPEN BORNÉ, dev/transition) → ACCEPTÉ avec WARN, en
   *        s'appuyant sur la confiance canal mTLS. Ce mode est INTERDIT en
   *        production (refus de boot, cf. `validateEnv`).
   *
   * La trace `_meta.origin` n'est PAS une authentification : elle rend une forge
   * détectable a posteriori, mais seule la signature (ou le mTLS canal)
   * authentifie l'émetteur. Voir doc 09 §9.4.
   *
   * @param msg     Message AMQP brut.
   * @param emitter Émetteur broker réel déjà résolu (ou `null`).
   * @returns `true` si l'origine est acceptée, `false` si le message doit être droppé.
   */
  private async isOriginTrusted(msg: ConsumeMessage, emitter: string | null): Promise<boolean> {
    const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
    const signature =
      typeof headers[HEADER_SIGNATURE] === 'string' ? headers[HEADER_SIGNATURE] : null;
    const expectedKey = emitter ? this.publisherKeys.get(emitter) : undefined;

    // (1) Une clé est enregistrée pour cet émetteur → la signature est EXIGÉE et
    // vérifiée. Toute absence/invalidité = forge potentielle → rejet.
    if (expectedKey) {
      if (!signature || !(await this.verifySignature(msg.content, signature, expectedKey))) {
        this.logger.warn(
          `Signature publisher invalide ou absente (émetteur=${emitter}, rk=${msg.fields.routingKey}) — rejet.`,
        );
        return false;
      }
      return true;
    }

    // (2) Aucune clé enregistrée pour l'émetteur (ou émetteur inconnu). Une
    // signature présente mais invérifiable (pas de clé) ne peut pas authentifier.
    if (signature) {
      this.logger.warn(
        `Signature présente mais aucune clé enregistrée pour l'émetteur (émetteur=${emitter ?? 'inconnu'}).`,
      );
    }

    // (3) Posture fail-closed : sans authentification d'origine, on droppe.
    if (this.requireSignedOrigin) {
      this.logger.warn(
        `Origine non authentifiée (émetteur=${emitter ?? 'inconnu'}, rk=${msg.fields.routingKey}) — rejet (AUDIT_REQUIRE_SIGNED_ORIGIN).`,
      );
      return false;
    }

    // (4) Posture fail-open BORNÉE (dev/transition uniquement, interdite en prod) :
    // on s'appuie sur la confiance canal mTLS et on trace l'émetteur réel.
    this.logger.warn(
      `Origine non authentifiée (émetteur=${emitter ?? 'inconnu'}, rk=${msg.fields.routingKey}) — ` +
        `accepté via confiance mTLS canal (fail-open dev ; signature publisher requise en prod).`,
    );
    return true;
  }

  /**
   * Vérifie une signature détachée Ed25519 (`x-nina-signature`, hex 128 chars)
   * sur les octets du corps du message contre la clé publique du publisher.
   * Toute erreur (hex invalide, longueur incorrecte) ⇒ `false` (jamais throw).
   *
   * @param content   Octets bruts du corps AMQP (ce que le publisher a signé).
   * @param sigHex    Signature hexadécimale détachée.
   * @param publicKey Clé publique Ed25519 (32 octets) du publisher.
   */
  private async verifySignature(
    content: Buffer,
    sigHex: string,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    if (!/^[0-9a-fA-F]{128}$/.test(sigHex)) return false;
    try {
      return await ed.verifyAsync(
        new Uint8Array(Buffer.from(sigHex, 'hex')),
        new Uint8Array(content),
        publicKey,
      );
    } catch {
      return false;
    }
  }

  /**
   * Extrait l'émetteur RÉEL d'un message au niveau broker (non falsifiable par
   * le CORPS du message) : propriété AMQP `appId` en priorité, puis en-têtes
   * applicatifs `x-nina-source` puis `x-source` (legacy identity-service).
   * Retourne `null` si aucun n'est présent.
   */
  private extractEmitter(msg: ConsumeMessage): string | null {
    const appId =
      typeof msg.properties.appId === 'string' && msg.properties.appId.length > 0
        ? msg.properties.appId
        : null;
    if (appId) return appId;
    const headers = (msg.properties.headers ?? {}) as Record<string, unknown>;
    for (const key of [HEADER_SOURCE, HEADER_SOURCE_LEGACY]) {
      const v = headers[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
  }

  /** Ferme proprement la connexion à l'arrêt. */
  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.conn?.close();
  }
}
