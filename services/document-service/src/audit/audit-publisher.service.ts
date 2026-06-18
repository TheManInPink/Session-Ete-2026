/**
 * @file        audit-publisher.service.ts
 * @description Publisher RabbitMQ vers l'exchange d'événements canonique `nina.events`
 *              (topic). Les routing keys `document.*` y sont captées par audit-service
 *              (pattern `document.#`) qui chaîne en Merkle, cf. doc 09.
 *
 *              En P0 : retry transparent + fire-and-forget (jamais bloquant).
 *              Si le broker est down, on logge un warn — l'opération métier
 *              n'est PAS rejetée (auditer un événement absent vaut mieux que
 *              refuser l'émission d'une FDI). audit-service rattrapera via
 *              ses queues mortes (DLX) — cf. doc 09 §9.
 *
 * @module      document-service/audit
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { Env } from '../config/env.schema';

/** Routing keys publiés par document-service. */
export type DocumentAuditRoutingKey =
  | 'document.fdi.generated'
  | 'document.revoked'
  | 'document.qr.verified';

@Injectable()
export class AuditPublisherService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(AuditPublisherService.name);
  private conn: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  private readonly url: string;
  private readonly exchange: string;

  constructor(cfg: ConfigService<Env, true>) {
    this.url = cfg.get('RABBITMQ_URL', { infer: true });
    this.exchange = cfg.get('RABBITMQ_EVENTS_EXCHANGE', { infer: true });
  }

  onModuleInit(): void {
    this.conn = connect([this.url], {
      heartbeatIntervalInSeconds: 5,
      reconnectTimeInSeconds: 5,
    });
    this.conn.on('connect', () => this.log.log(`RabbitMQ connecté (${this.exchange})`));
    this.conn.on('disconnect', ({ err }) =>
      this.log.warn(`RabbitMQ déconnecté : ${err?.message ?? 'unknown'}`),
    );
    this.channel = this.conn.createChannel({
      json: true,
      setup: async (ch: {
        assertExchange: (n: string, t: string, o: { durable: boolean }) => Promise<unknown>;
      }) => {
        await ch.assertExchange(this.exchange, 'topic', { durable: true });
      },
    });
  }

  /**
   * Publie un événement d'audit. Fire-and-forget — jamais bloquant.
   *
   * @param routingKey ex. "document.fdi.generated"
   * @param payload    données métier (sera enrichi de source + emittedAt)
   */
  async publish(
    routingKey: DocumentAuditRoutingKey,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.channel) {
      this.log.warn(`audit non publié (channel pas prêt) : ${routingKey}`);
      return;
    }
    const enriched = {
      ...payload,
      source: 'document-service',
      emittedAt: new Date().toISOString(),
    };
    try {
      await this.channel.publish(this.exchange, routingKey, enriched, {
        persistent: true,
        contentType: 'application/json',
      });
    } catch (err) {
      this.log.warn(`audit publish failed (${routingKey}): ${(err as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.conn?.close();
  }
}
