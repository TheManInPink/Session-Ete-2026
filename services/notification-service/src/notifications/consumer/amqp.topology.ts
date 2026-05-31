/**
 * @file        amqp.topology.ts
 * @description Topologie RabbitMQ du notification-service + assertion idempotente.
 *
 *              Flux principal :
 *                exchange topic `nina.notifications`
 *                  → notification.sms / .email / .ussd / .push   (un canal = une file)
 *                  → notification.work  (file de ré-injection, clé `notification.requeue`)
 *
 *              Ré-essai exponentiel (back-off) SANS plugin delayed-message :
 *                à l'échec n, on publie le job dans la file de délai
 *                `notification.retry.k` (TTL = palier k). À l'expiration du TTL,
 *                RabbitMQ dead-lette le message vers `nina.notifications` avec la
 *                clé `notification.requeue` → file `notification.work` → consumer.
 *                (Une file PAR palier : un TTL unique par file évite le blocage
 *                en tête de file des TTL hétérogènes.)
 *
 *              Échec définitif → exchange `nina.dlx` (fanout) → `dlx.parking`.
 *
 *              ⚠️  Les arguments des files PRÉ-EXISTANTES (notification.sms /
 *              .email / .ussd, cf. infrastructure/.../definitions.json) sont
 *              répliqués À L'IDENTIQUE ici : un `assertQueue` avec des arguments
 *              divergents lèverait PRECONDITION_FAILED (406).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/consumer
 */
import type { Channel } from 'amqplib';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { NotificationChannel } from '../channels/channel.types.js';

/** TTL des files canal (aligné definitions.json). */
const SMS_EMAIL_PUSH_TTL_MS = 3_600_000; // 1 h
const USSD_TTL_MS = 300_000; // 5 min

/** Clé de routage de la file de ré-injection. */
export const REQUEUE_ROUTING_KEY = 'notification.requeue';

/** Topologie résolue (noms + paliers de ré-essai). */
export interface Topology {
  notificationsExchange: string;
  dlxExchange: string;
  smsQueue: string;
  emailQueue: string;
  ussdQueue: string;
  pushQueue: string;
  workQueue: string;
  /** Files consommées (canaux + ré-injection). */
  consumedQueues: string[];
  /** Paliers de back-off (ms), un par tentative de ré-essai. */
  retryDelaysMs: number[];
  /** Noms des files de délai, indexés 1..N (parallèles à `retryDelaysMs`). */
  retryQueues: string[];
}

/** Construit la topologie à partir de la configuration validée. */
export function buildTopology(cfg: ConfigService<Env, true>): Topology {
  const retryDelaysMs = cfg
    .get('NOTIFICATION_RETRY_DELAYS_MS', { infer: true })
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const smsQueue = cfg.get('RABBITMQ_SMS_QUEUE', { infer: true });
  const emailQueue = cfg.get('RABBITMQ_EMAIL_QUEUE', { infer: true });
  const ussdQueue = cfg.get('RABBITMQ_USSD_QUEUE', { infer: true });
  const pushQueue = cfg.get('RABBITMQ_PUSH_QUEUE', { infer: true });
  const workQueue = cfg.get('RABBITMQ_WORK_QUEUE', { infer: true });

  return {
    notificationsExchange: cfg.get('RABBITMQ_NOTIFICATIONS_EXCHANGE', { infer: true }),
    dlxExchange: cfg.get('RABBITMQ_DLX_EXCHANGE', { infer: true }),
    smsQueue,
    emailQueue,
    ussdQueue,
    pushQueue,
    workQueue,
    consumedQueues: [smsQueue, emailQueue, ussdQueue, pushQueue, workQueue],
    retryDelaysMs,
    retryQueues: retryDelaysMs.map((_d, i) => `notification.retry.${i + 1}`),
  };
}

/** Clé de routage `notification.<canal>` pour publier vers la bonne file. */
export function routingKeyForChannel(channel: NotificationChannel): string {
  switch (channel) {
    case NotificationChannel.SMS:
      return 'notification.sms';
    case NotificationChannel.EMAIL:
      return 'notification.email';
    case NotificationChannel.USSD:
      return 'notification.ussd';
    case NotificationChannel.PUSH:
      return 'notification.push';
    default:
      // VOICE et autres canaux non transportés par RabbitMQ ici.
      return 'notification.sms';
  }
}

/**
 * Déclare (idempotemment) l'ensemble des exchanges, files et liaisons.
 * Appelée dans le `setup` des canaux publisher ET consumer (assertion
 * répétée = no-op si les arguments concordent).
 *
 * @param ch   Canal AMQP brut (fourni par amqp-connection-manager).
 * @param topo Topologie résolue.
 */
export async function assertTopology(ch: Channel, topo: Topology): Promise<void> {
  // Exchanges.
  await ch.assertExchange(topo.notificationsExchange, 'topic', { durable: true });
  await ch.assertExchange(topo.dlxExchange, 'fanout', { durable: true });

  // Files canal (arguments alignés sur definitions.json).
  const dlxArgs = {
    'x-dead-letter-exchange': topo.dlxExchange,
    'x-message-ttl': SMS_EMAIL_PUSH_TTL_MS,
  };
  await ch.assertQueue(topo.smsQueue, { durable: true, arguments: dlxArgs });
  await ch.assertQueue(topo.emailQueue, { durable: true, arguments: dlxArgs });
  await ch.assertQueue(topo.pushQueue, { durable: true, arguments: dlxArgs });
  await ch.assertQueue(topo.ussdQueue, {
    durable: true,
    arguments: { 'x-message-ttl': USSD_TTL_MS },
  });

  // File de ré-injection (reçoit les messages relâchés par les files de délai).
  await ch.assertQueue(topo.workQueue, { durable: true });

  // Liaisons canal.
  await ch.bindQueue(topo.smsQueue, topo.notificationsExchange, 'notification.sms');
  await ch.bindQueue(topo.emailQueue, topo.notificationsExchange, 'notification.email');
  await ch.bindQueue(topo.ussdQueue, topo.notificationsExchange, 'notification.ussd');
  await ch.bindQueue(topo.pushQueue, topo.notificationsExchange, 'notification.push');
  await ch.bindQueue(topo.workQueue, topo.notificationsExchange, REQUEUE_ROUTING_KEY);

  // Files de délai (une par palier ; dead-letter → file de ré-injection).
  for (let i = 0; i < topo.retryQueues.length; i++) {
    await ch.assertQueue(topo.retryQueues[i]!, {
      durable: true,
      arguments: {
        'x-message-ttl': topo.retryDelaysMs[i]!,
        'x-dead-letter-exchange': topo.notificationsExchange,
        'x-dead-letter-routing-key': REQUEUE_ROUTING_KEY,
      },
    });
  }
}
