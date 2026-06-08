/**
 * @file        appointments.cron.ts
 * @description Tâches planifiées : rappels SMS (J-1 et H-2) et balayage des
 *              absences (no-show). Toutes les 10 minutes.
 *
 *              Rappels : on sélectionne les RDV planifiés dont l'heure tombe dans
 *              une fenêtre [seuil, seuil + largeur] (largeur ≥ intervalle du cron
 *              pour ne rien manquer). L'idempotence est garantie côté
 *              notification-service (clé `appt:<id>:reminder-*`), donc un éventuel
 *              chevauchement de fenêtres n'entraîne pas de double SMS.
 *
 *              No-show : un RDV resté SCHEDULED au-delà de l'heure prévue +
 *              délai de grâce bascule en NO_SHOW (et peut déclencher une
 *              blacklist temporaire, cf. AppointmentsService.markNoShow).
 *
 *              Désactivable via `APPOINTMENT_CRON_ENABLED=false` (tests/CI).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env.schema.js';
import { AppointmentRepository } from './appointment.repository.js';
import { AppointmentsService } from './appointments.service.js';

const MS_PER_MIN = 60_000;
const H24_MS = 24 * 60 * MS_PER_MIN;
const H2_MS = 2 * 60 * MS_PER_MIN;

@Injectable()
export class AppointmentsCron {
  private readonly logger = new Logger(AppointmentsCron.name);
  private readonly enabled: boolean;
  private readonly windowMs: number;
  private readonly graceMs: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly repo: AppointmentRepository,
    private readonly service: AppointmentsService,
  ) {
    this.enabled = cfg.get('APPOINTMENT_CRON_ENABLED', { infer: true });
    this.windowMs = cfg.get('APPOINTMENT_REMINDER_WINDOW_MIN', { infer: true }) * MS_PER_MIN;
    this.graceMs = cfg.get('APPOINTMENT_NOSHOW_GRACE_MIN', { infer: true }) * MS_PER_MIN;
  }

  /** Rappels J-1 et H-2 — toutes les 10 minutes. */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'appointment-reminders' })
  async scanReminders(): Promise<void> {
    if (!this.enabled) return;
    try {
      const now = Date.now();
      await this.fireReminders(new Date(now + H24_MS), '24h');
      await this.fireReminders(new Date(now + H2_MS), '2h');
    } catch (err) {
      this.logger.error(`Scan des rappels échoué : ${(err as Error).message}`);
    }
  }

  /** Balayage des no-show — toutes les 10 minutes. */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'appointment-no-show-sweep' })
  async sweepNoShows(): Promise<void> {
    if (!this.enabled) return;
    try {
      const cutoff = new Date(Date.now() - this.graceMs);
      const overdue = await this.repo.findOverdueScheduled(cutoff);
      let flagged = 0;
      for (const row of overdue) {
        if (await this.service.markNoShow(row)) flagged += 1;
      }
      if (flagged > 0) this.logger.log(`No-show : ${flagged} rendez-vous marqués absents`);
    } catch (err) {
      this.logger.error(`Balayage no-show échoué : ${(err as Error).message}`);
    }
  }

  /** Publie les rappels pour les RDV dont l'heure tombe dans [seuil, seuil+largeur]. */
  private async fireReminders(threshold: Date, kind: '24h' | '2h'): Promise<void> {
    const rows = await this.repo.findScheduledBetween(
      threshold,
      new Date(threshold.getTime() + this.windowMs),
    );
    for (const row of rows) {
      await this.service.sendReminder(row, kind);
    }
    if (rows.length > 0) this.logger.debug(`Rappels ${kind} : ${rows.length} publié(s)`);
  }
}
