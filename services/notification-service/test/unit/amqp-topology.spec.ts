/**
 * @file        amqp-topology.spec.ts
 * @description Tests de la topologie RabbitMQ : parsing des paliers de ré-essai,
 *              cohérence files de délai/délais, et clés de routage par canal.
 * @module      notification-service/test
 */
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.schema.js';
import { NotificationChannel } from '../../src/notifications/channels/channel.types.js';
import {
  buildTopology,
  routingKeyForChannel,
  REQUEUE_ROUTING_KEY,
} from '../../src/notifications/consumer/amqp.topology.js';

function cfg(retry = '60000,300000,1800000,7200000,43200000'): ConfigService<Env, true> {
  const base: Record<string, unknown> = {
    RABBITMQ_NOTIFICATIONS_EXCHANGE: 'nina.notifications',
    RABBITMQ_DLX_EXCHANGE: 'nina.dlx',
    RABBITMQ_SMS_QUEUE: 'notification.sms',
    RABBITMQ_EMAIL_QUEUE: 'notification.email',
    RABBITMQ_USSD_QUEUE: 'notification.ussd',
    RABBITMQ_PUSH_QUEUE: 'notification.push',
    RABBITMQ_WORK_QUEUE: 'notification.work',
    NOTIFICATION_RETRY_DELAYS_MS: retry,
  };
  return { get: (k: string) => base[k] } as unknown as ConfigService<Env, true>;
}

describe('amqp.topology', () => {
  it('construit 5 paliers de ré-essai (60s..12h) et leurs files', () => {
    const t = buildTopology(cfg());
    expect(t.retryDelaysMs).toEqual([60000, 300000, 1800000, 7200000, 43200000]);
    expect(t.retryQueues).toEqual([
      'notification.retry.1',
      'notification.retry.2',
      'notification.retry.3',
      'notification.retry.4',
      'notification.retry.5',
    ]);
  });

  it('consomme les 4 files canal + la file de ré-injection', () => {
    const t = buildTopology(cfg());
    expect(t.consumedQueues).toEqual([
      'notification.sms',
      'notification.email',
      'notification.ussd',
      'notification.push',
      'notification.work',
    ]);
  });

  it('ignore les paliers invalides dans la config CSV', () => {
    const t = buildTopology(cfg('60000, abc, -5, 300000'));
    expect(t.retryDelaysMs).toEqual([60000, 300000]);
  });

  it('mappe chaque canal vers sa clé de routage', () => {
    expect(routingKeyForChannel(NotificationChannel.SMS)).toBe('notification.sms');
    expect(routingKeyForChannel(NotificationChannel.EMAIL)).toBe('notification.email');
    expect(routingKeyForChannel(NotificationChannel.USSD)).toBe('notification.ussd');
    expect(routingKeyForChannel(NotificationChannel.PUSH)).toBe('notification.push');
    expect(REQUEUE_ROUTING_KEY).toBe('notification.requeue');
  });
});
