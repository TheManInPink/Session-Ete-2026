/**
 * @file        notification.publisher.ts
 * @description Producteur RabbitMQ : publie les jobs (broadcast / re-publication),
 *              programme les ré-essais (files de délai TTL) et achemine les
 *              échecs définitifs vers la DLQ. Détient son propre canal de
 *              publication (canal de confirmation : `publish` résout après ACK
 *              broker).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/consumer
 */
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Channel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Env } from '../../config/env.schema.js';
import type { NotificationChannel } from '../channels/channel.types.js';
import type { NotificationJob } from '../job.types.js';
import { RabbitConnection } from './rabbit.connection.js';
import {
  assertTopology,
  buildTopology,
  routingKeyForChannel,
  type Topology,
} from './amqp.topology.js';

@Injectable()
export class NotificationPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationPublisher.name);
  private readonly topo: Topology;
  private channel: ChannelWrapper | null = null;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly connection: RabbitConnection,
  ) {
    this.topo = buildTopology(cfg);
  }

  /** Nombre maximal de ré-essais avant DLQ (= nombre de paliers). */
  get maxRetries(): number {
    return this.topo.retryDelaysMs.length;
  }

  /** Crée le canal de publication + déclare la topologie. */
  onModuleInit(): void {
    if (!this.connection.isEnabled()) {
      this.logger.warn('Publisher RabbitMQ désactivé');
      return;
    }
    this.channel = this.connection.get().createChannel({
      json: false,
      setup: (ch: Channel) => assertTopology(ch, this.topo),
    });
  }

  /**
   * Publie un job vers la file du canal (tentative initiale).
   *
   * @param job     Job de notification.
   * @param channel Canal résolu (détermine la clé de routage).
   */
  async publishJob(job: NotificationJob, channel: NotificationChannel): Promise<void> {
    const rk = routingKeyForChannel(channel);
    await this.require().publish(
      this.topo.notificationsExchange,
      rk,
      this.encode({ ...job, channel }),
      {
        persistent: true,
        contentType: 'application/json',
        headers: { 'x-nina-attempt': 0 },
      },
    );
  }

  /**
   * Programme un ré-essai : dépose le job dans la file de délai du palier
   * `nextAttempt` (TTL). À expiration, RabbitMQ le réinjecte dans la file de
   * travail.
   *
   * @param job         Job à ré-essayer.
   * @param nextAttempt Numéro de la prochaine tentative (1..maxRetries).
   */
  async scheduleRetry(job: NotificationJob, nextAttempt: number): Promise<void> {
    const queue = this.topo.retryQueues[nextAttempt - 1];
    if (!queue) throw new Error(`Palier de ré-essai ${nextAttempt} inexistant`);
    await this.require().sendToQueue(queue, this.encode(job), {
      persistent: true,
      contentType: 'application/json',
      headers: { 'x-nina-attempt': nextAttempt },
    });
    this.logger.debug(
      `Ré-essai #${nextAttempt} programmé (délai ${this.topo.retryDelaysMs[nextAttempt - 1]} ms) → ${queue}`,
    );
  }

  /**
   * Achemine un job en échec définitif vers la DLQ (exchange `nina.dlx`).
   *
   * @param job    Job abandonné.
   * @param reason Raison de l'abandon (en-tête diagnostic).
   */
  async sendToDlq(job: NotificationJob, reason: string): Promise<void> {
    await this.require().publish(this.topo.dlxExchange, '', this.encode(job), {
      persistent: true,
      contentType: 'application/json',
      headers: { 'x-nina-dead-reason': reason },
    });
    this.logger.warn(`Job envoyé en DLQ (${reason}) : ${job.template} → ${job.recipient}`);
  }

  /** Indique si le publisher est prêt (canal disponible). */
  isReady(): boolean {
    return this.channel !== null;
  }

  private require(): ChannelWrapper {
    if (!this.channel) {
      throw new ServiceUnavailableException('Bus de notifications indisponible (RabbitMQ)');
    }
    return this.channel;
  }

  private encode(o: unknown): Buffer {
    return Buffer.from(JSON.stringify(o), 'utf8');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
  }
}
