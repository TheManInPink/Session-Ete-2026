/**
 * @file        notification.publisher.ts
 * @description Producteur RabbitMQ : publie des jobs de notification vers
 *              l'exchange topic `nina.notifications` (consommé par
 *              notification-service). L'appointment-service ne rend pas les
 *              messages lui-même : il délègue le rendu multilingue, l'idempotence
 *              et la livraison (SMS/email) au notification-service.
 *
 *              Contrat de message (cf. notification-service/job.types.ts) :
 *                { recipient, channel, template, variables, priority, language,
 *                  recipientCitizenId, idempotencyKey }
 *              Clé de routage : `notification.<canal>` ; en-tête `x-nina-attempt: 0`.
 *
 *              ⚠️ L'idempotence est portée par `idempotencyKey` (ex.
 *              `appt:<id>:reminder-24h`) : un rappel republié (chevauchement de
 *              fenêtres cron, redélivrance) n'est expédié qu'une fois.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments/messaging
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Channel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Env } from '../../config/env.schema.js';
import { RabbitConnection } from './rabbit.connection.js';

/** Forme « fil » d'un job de notification (alignée notification-service). */
export interface NotificationJob {
  recipient: string;
  channel: 'sms' | 'email' | 'push' | 'ussd';
  template: string;
  variables?: Record<string, string | number>;
  priority?: string;
  language?: string;
  recipientCitizenId?: string | null;
  idempotencyKey?: string | null;
}

@Injectable()
export class NotificationPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationPublisher.name);
  private readonly exchange: string;
  private channel: ChannelWrapper | null = null;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly connection: RabbitConnection,
  ) {
    this.exchange = cfg.get('RABBITMQ_NOTIFICATIONS_EXCHANGE', { infer: true });
  }

  /** Crée le canal de publication + déclare l'exchange (idempotent). */
  onModuleInit(): void {
    if (!this.connection.isEnabled()) {
      this.logger.warn('Publisher RabbitMQ désactivé (notifications non publiées)');
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
   * Publie un job de notification. Best-effort : si RabbitMQ est indisponible,
   * on journalise et on renvoie `false` SANS faire échouer l'opération métier
   * (la prise de RDV ne doit pas dépendre de la disponibilité du bus de
   * notifications). La persistance du RDV reste la source de vérité.
   *
   * @param job Job de notification à publier.
   * @returns `true` si publié, `false` si désactivé/indisponible.
   */
  async publish(job: NotificationJob): Promise<boolean> {
    if (!this.channel) return false;
    try {
      const routingKey = `notification.${job.channel}`;
      await this.channel.publish(this.exchange, routingKey, this.encode(job), {
        persistent: true,
        contentType: 'application/json',
        headers: { 'x-nina-attempt': 0 },
      });
      return true;
    } catch (err) {
      this.logger.warn(
        `Publication notification impossible (${job.template}) : ${(err as Error).message}`,
      );
      return false;
    }
  }

  private encode(o: unknown): Buffer {
    return Buffer.from(JSON.stringify(o), 'utf8');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
  }
}
