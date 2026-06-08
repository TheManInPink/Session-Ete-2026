/**
 * @file        notifications.consumer.ts
 * @description Consumer RabbitMQ (workers parallèles via prefetch). Consomme
 *              les files canal + la file de ré-injection, traite chaque job,
 *              puis : ACK si SENT ; programme un ré-essai si échec transitoire ;
 *              envoie en DLQ si échec définitif ou tentatives épuisées.
 *
 *              Un message non-JSON ou une erreur d'ENTRÉE (template/canal
 *              invalides) part directement en DLQ (pas de boucle de poison).
 *              L'ACK est toujours émis APRÈS décision (livraison at-least-once
 *              neutralisée par l'idempotence côté service).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/consumer
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { Env } from '../../config/env.schema.js';
import { NotificationStatus } from '../channels/channel.types.js';
import { TemplateRenderError } from '../templates/template.registry.js';
import { NotificationsService } from '../notifications.service.js';
import type { NotificationJob } from '../job.types.js';
import { RabbitConnection } from './rabbit.connection.js';
import { NotificationPublisher } from './notification.publisher.js';
import { RateLimiter } from './rate-limiter.js';
import { assertTopology, buildTopology, type Topology } from './amqp.topology.js';

@Injectable()
export class NotificationsConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsConsumer.name);
  private readonly topo: Topology;
  private readonly prefetch: number;
  private channel: ChannelWrapper | null = null;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly connection: RabbitConnection,
    private readonly service: NotificationsService,
    private readonly publisher: NotificationPublisher,
    private readonly rateLimiter: RateLimiter,
  ) {
    this.topo = buildTopology(cfg);
    this.prefetch = cfg.get('RABBITMQ_PREFETCH', { infer: true });
  }

  /** Déclare la topologie, fixe le prefetch et démarre la consommation. */
  onModuleInit(): void {
    if (!this.connection.isEnabled()) {
      this.logger.warn('Consumer RabbitMQ désactivé (RABBITMQ_CONSUMER_ENABLED=false)');
      return;
    }
    this.channel = this.connection.get().createChannel({
      setup: async (ch: Channel) => {
        await assertTopology(ch, this.topo);
        await ch.prefetch(this.prefetch);
        for (const queue of this.topo.consumedQueues) {
          await ch.consume(queue, (msg) => this.handle(msg), { noAck: false });
        }
        this.logger.log(
          `Consommation : [${this.topo.consumedQueues.join(', ')}] prefetch=${this.prefetch}`,
        );
      },
    });
  }

  /** Traite un message (parse → rate-limit → DÉCIDE → EXÉCUTE durablement). */
  private async handle(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;
    const channel = this.channel;

    let job: NotificationJob;
    try {
      job = JSON.parse(msg.content.toString('utf8')) as NotificationJob;
    } catch {
      // Message non-JSON : irrécupérable (jamais traitable) → ACK (drop), pas de boucle.
      this.logger.warn(`Message non-JSON ignoré (rk=${msg.fields.routingKey})`);
      channel.ack(msg);
      return;
    }

    const attempt = Number(msg.properties.headers?.['x-nina-attempt'] ?? 0) || 0;

    // Régule le débit (protège les fournisseurs) — chemin événementiel uniquement.
    await this.rateLimiter.acquire();

    // 1) DÉCIDE de l'action SANS toucher au broker (aucun ACK ici).
    let action: { kind: 'ack' } | { kind: 'retry'; next: number } | { kind: 'dlq'; reason: string };
    try {
      const { result } = await this.service.processJob(job, attempt);
      if (result.status === NotificationStatus.SENT) {
        action = { kind: 'ack' };
      } else if (!result.permanent && attempt < this.publisher.maxRetries) {
        action = { kind: 'retry', next: attempt + 1 };
      } else {
        action = { kind: 'dlq', reason: result.failureReason ?? 'échec définitif' };
      }
    } catch (err) {
      // Erreur d'ENTRÉE (template/variable/canal) ⇒ non réessayable ⇒ DLQ.
      const reason =
        err instanceof TemplateRenderError ? `${err.code}: ${err.message}` : (err as Error).message;
      this.logger.warn(`Job rejeté (${reason}) : ${job.template} → ${job.recipient}`);
      action = { kind: 'dlq', reason };
    }

    // 2) EXÉCUTE l'action durablement. L'ACK n'intervient QU'APRÈS un transfert
    //    de responsabilité réussi (retry programmé ou DLQ écrite). Si la
    //    republication échoue (broker indisponible), on NACK+requeue pour
    //    laisser RabbitMQ redélivrer — JAMAIS de perte silencieuse.
    try {
      if (action.kind === 'retry') {
        await this.publisher.scheduleRetry(job, action.next);
      } else if (action.kind === 'dlq') {
        await this.publisher.sendToDlq(job, action.reason);
      }
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Republication impossible (${(err as Error).message}) — NACK+requeue (pas de perte).`,
      );
      channel.nack(msg, false, true);
    }
  }

  /** Ferme proprement le canal de consommation à l'arrêt. */
  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
  }
}
