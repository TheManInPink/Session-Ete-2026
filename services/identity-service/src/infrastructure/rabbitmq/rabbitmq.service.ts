/**
 * @file        rabbitmq.service.ts
 * @description Publisher RabbitMQ pour les événements `citizen.created`,
 *              `citizen.updated`, `correction.submitted`, etc.
 *
 *              Exchange topic `nina.events`, routing keys hiérarchiques :
 *                citizen.created
 *                citizen.updated
 *                correction.submitted
 *                correction.approved
 *                correction.rejected
 *
 *              Consommateurs typiques (autres services) :
 *                - audit-service (toutes les routes → audit log)
 *                - notification-service (citizen.created → email/SMS bienvenue)
 *                - ai-service (correction.submitted → indexation)
 *
 *              Tolérant aux pannes : un échec de publish n'interrompt PAS
 *              l'opération métier (best-effort). En prod, brancher Outbox
 *              pattern (cf. doc 07 §4.7).
 *
 * @module      identity-service/infrastructure/rabbitmq
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

/** Forme commune des événements émis par identity-service. */
export interface DomainEvent<T = unknown> {
  eventType: string; // 'citizen.created', etc.
  eventId: string; // UUID
  timestamp: string; // ISO 8601
  source: 'identity-service';
  actorId?: string; // user qui a déclenché l'action
  payload: T;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  // Exchange topic canonique du bus d'événements (cf. infrastructure/.../definitions.json
  // et audit-service `RABBITMQ_EVENTS_EXCHANGE`). Réconcilié de l'ancien `nina-aes.events`.
  private readonly exchange = process.env.RABBITMQ_EXCHANGE ?? 'nina.events';
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchange, 'topic', { durable: true });

      this.connection.on('error', (err) =>
        this.logger.warn(`RabbitMQ connection error : ${err.message}`),
      );
      this.connection.on('close', () => this.logger.warn('RabbitMQ connection closed'));

      this.logger.log(`Connecté à RabbitMQ exchange='${this.exchange}'`);
    } catch (err) {
      this.logger.warn(
        `Connexion RabbitMQ échouée — les événements seront drop : ${(err as Error).message}`,
      );
      // Best-effort : on continue sans bloquer le service
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // ignore
    }
  }

  /**
   * Publie un événement métier sur l'exchange topic.
   *
   * @param routingKey  - ex. 'citizen.created' (hiérarchique avec points)
   * @param payload     - corps de l'événement (sérialisé JSON)
   * @param actorId     - id du user qui déclenche (optionnel)
   *
   * @returns true si publié OK, false sinon (best-effort).
   */
  async publish<T>(routingKey: string, payload: T, actorId?: string): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(`Skip publish ${routingKey} — channel unavailable`);
      return false;
    }

    const event: DomainEvent<T> = {
      eventType: routingKey,
      eventId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source: 'identity-service',
      actorId,
      payload,
    };

    try {
      const ok = this.channel.publish(
        this.exchange,
        routingKey,
        Buffer.from(JSON.stringify(event)),
        {
          contentType: 'application/json',
          persistent: true,
          messageId: event.eventId,
          timestamp: Date.now(),
          headers: {
            'x-source': 'identity-service',
            'x-version': '1',
          },
        },
      );
      if (!ok) {
        this.logger.warn(`Publish ${routingKey} backpressure — retry plus tard`);
      }
      return ok;
    } catch (err) {
      this.logger.warn(`Publish ${routingKey} fail : ${(err as Error).message}`);
      return false;
    }
  }

  /** Healthcheck connectivité. */
  isConnected(): boolean {
    return this.channel !== null && this.connection !== null;
  }
}
