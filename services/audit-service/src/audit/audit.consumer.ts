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
 *              ⚠️  DRIFT CONNU : document-service publie aujourd'hui sur son
 *              propre exchange `audit.events` (cf. son `RABBITMQ_AUDIT_EXCHANGE`),
 *              non capté ici. Réconciliation : aligner document-service sur
 *              `nina.events` + clés `document.*` (cf. doc 09 §9 / MAINTENANCE).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { Env } from '../config/env.schema.js';
import { AuditBatcher } from './audit.batcher.js';
import { AuditNormalizer } from './audit.normalizer.js';

/** TTL de la queue audit (7 jours, aligné infrastructure/.../definitions.json). */
const AUDIT_QUEUE_TTL_MS = 604_800_000;

@Injectable()
export class AuditConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuditConsumer.name);
  private conn: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    private readonly batcher: AuditBatcher,
    private readonly normalizer: AuditNormalizer,
  ) {}

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
        await ch.consume(queue, (msg) => this.handle(msg), { noAck: false });
        this.logger.log(
          `Topologie prête : ${auditExchange}(fanout) + ${eventsExchange}(topic ${patterns.length} patterns) → ${queue}`,
        );
      },
    });
  }

  /** Traite un message : parse → normalise → empile (ACK différé). */
  private handle(msg: ConsumeMessage | null): void {
    if (!msg || !this.channel) return;
    const channel = this.channel;

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

  /** Ferme proprement la connexion à l'arrêt. */
  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.conn?.close();
  }
}
