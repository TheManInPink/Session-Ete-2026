/**
 * @file        notifications.module.ts
 * @description Module métier : assemble les canaux (SMS/email/push), le moteur
 *              de templates, la persistance, les métriques, la connexion + le
 *              producteur/consommateur RabbitMQ, et le controller REST.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/notifications
 */
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationRepository } from './notification.repository.js';
import { NotificationsMetrics } from './metrics/notifications.metrics.js';
import { TemplateRegistry } from './templates/template.registry.js';
import { ChannelDispatcher } from './channels/channel.dispatcher.js';
import { AfricasTalkingSmsProvider } from './channels/sms.provider.js';
import { SmtpEmailProvider } from './channels/email.provider.js';
import { FcmPushProvider } from './channels/push.provider.js';
import { RabbitConnection } from './consumer/rabbit.connection.js';
import { NotificationPublisher } from './consumer/notification.publisher.js';
import { RateLimiter } from './consumer/rate-limiter.js';
import { NotificationsConsumer } from './consumer/notifications.consumer.js';

@Module({
  controllers: [NotificationsController],
  providers: [
    // Canaux
    AfricasTalkingSmsProvider,
    SmtpEmailProvider,
    FcmPushProvider,
    ChannelDispatcher,
    // Templates + persistance + métriques
    TemplateRegistry,
    NotificationRepository,
    NotificationsMetrics,
    // Bus RabbitMQ
    RabbitConnection,
    NotificationPublisher,
    RateLimiter,
    NotificationsConsumer,
    // Orchestration
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
