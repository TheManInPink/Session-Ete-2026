/**
 * @file        rabbit.connection.ts
 * @description Connexion RabbitMQ partagée (amqp-connection-manager, reconnexion
 *              auto) pour publier les jobs de notification. Une seule connexion
 *              TCP, fermée proprement au SIGTERM. Désactivable (test/CI) via
 *              `APPOINTMENT_NOTIFICATIONS_ENABLED=false`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments/messaging
 */
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type AmqpConnectionManager } from 'amqp-connection-manager';
import type { Env } from '../../config/env.schema.js';

@Injectable()
export class RabbitConnection implements OnApplicationShutdown {
  private readonly logger = new Logger(RabbitConnection.name);
  private readonly enabled: boolean;
  private readonly url: string;
  private conn: AmqpConnectionManager | null = null;

  constructor(cfg: ConfigService<Env, true>) {
    this.enabled = cfg.get('APPOINTMENT_NOTIFICATIONS_ENABLED', { infer: true });
    this.url = cfg.get('RABBITMQ_URL', { infer: true });
  }

  /** Active si la publication RabbitMQ est autorisée (désactivable en test). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Renvoie la connexion (créée paresseusement au premier appel).
   *
   * @throws Error si la publication RabbitMQ est désactivée.
   */
  get(): AmqpConnectionManager {
    if (!this.enabled) {
      throw new Error('RabbitMQ désactivé (APPOINTMENT_NOTIFICATIONS_ENABLED=false)');
    }
    if (!this.conn) {
      this.conn = connect([this.url], { heartbeatIntervalInSeconds: 5, reconnectTimeInSeconds: 5 });
      this.conn.on('connect', () => this.logger.log('RabbitMQ connecté'));
      this.conn.on('disconnect', ({ err }) =>
        this.logger.warn(`RabbitMQ déconnecté : ${err?.message ?? 'inconnu'}`),
      );
    }
    return this.conn;
  }

  /** Ferme la connexion à l'arrêt du service. */
  async onApplicationShutdown(): Promise<void> {
    await this.conn?.close().catch(() => undefined);
  }
}
