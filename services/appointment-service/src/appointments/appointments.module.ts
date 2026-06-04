/**
 * @file        appointments.module.ts
 * @description Module métier des rendez-vous : cycle de vie, file d'attente
 *              virtuelle, publication des notifications, tâches planifiées
 *              (rappels + no-show). Importe CentersModule (validation des
 *              créneaux à la réservation).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */
import { Module } from '@nestjs/common';
import { CentersModule } from '../centers/centers.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentRepository } from './appointment.repository.js';
import { QueueService } from './queue.service.js';
import { AppointmentsCron } from './appointments.cron.js';
import { RabbitConnection } from './messaging/rabbit.connection.js';
import { NotificationPublisher } from './messaging/notification.publisher.js';

@Module({
  imports: [CentersModule],
  controllers: [AppointmentsController],
  providers: [
    AppointmentRepository,
    QueueService,
    RabbitConnection,
    NotificationPublisher,
    AppointmentsCron,
    AppointmentsService,
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
