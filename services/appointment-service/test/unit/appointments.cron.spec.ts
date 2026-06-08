/**
 * @file        appointments.cron.spec.ts
 * @description Tests des tâches planifiées : verrou d'élection de leader
 *              multi-instance (une seule réplique traite chaque tick) et
 *              désactivation via configuration. Tous les collaborateurs mockés.
 * @module      appointment-service/test
 */
// `@nina-aes/database` est ESM : on le mocke pour le runtime CommonJS de Jest
// (le cron importe transitivement le repository qui référence Prisma).
jest.mock('@nina-aes/database', () => ({
  prisma: {},
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code = '';
    },
  },
}));

import { AppointmentsCron } from '../../src/appointments/appointments.cron.js';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.schema.js';
import type { AppointmentRepository } from '../../src/appointments/appointment.repository.js';
import type { AppointmentsService } from '../../src/appointments/appointments.service.js';
import type { RedisService } from '../../src/infrastructure/redis/redis.service.js';

/** ConfigService factice : valeurs minimales attendues par le cron. */
function cfg(enabled = true): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    APPOINTMENT_CRON_ENABLED: enabled,
    APPOINTMENT_REMINDER_WINDOW_MIN: 15,
    APPOINTMENT_NOSHOW_GRACE_MIN: 30,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService<Env, true>;
}

function build(over: { enabled?: boolean; locked?: boolean } = {}) {
  const repo = {
    findScheduledBetween: jest.fn().mockResolvedValue([]),
    findOverdueScheduled: jest.fn().mockResolvedValue([]),
  };
  const service = {
    sendReminder: jest.fn().mockResolvedValue(undefined),
    markNoShow: jest.fn().mockResolvedValue(false),
  };
  // locked=true ⇒ une AUTRE instance détient le verrou ⇒ tryLock renvoie false.
  const redis = { tryLock: jest.fn().mockResolvedValue(!(over.locked ?? false)) };
  const cron = new AppointmentsCron(
    cfg(over.enabled ?? true),
    repo as unknown as AppointmentRepository,
    service as unknown as AppointmentsService,
    redis as unknown as RedisService,
  );
  return { cron, repo, service, redis };
}

describe('AppointmentsCron — verrou multi-instance', () => {
  it('scanReminders ne fait rien si le verrou est détenu par une autre instance', async () => {
    const { cron, repo, redis } = build({ locked: true });
    await cron.scanReminders();
    expect(redis.tryLock).toHaveBeenCalledWith('cron:reminders', expect.any(Number));
    expect(repo.findScheduledBetween).not.toHaveBeenCalled();
  });

  it('scanReminders traite la fenêtre si le verrou est acquis', async () => {
    const { cron, repo } = build({ locked: false });
    await cron.scanReminders();
    // Deux fenêtres balayées (J-1 et H-2).
    expect(repo.findScheduledBetween).toHaveBeenCalledTimes(2);
  });

  it('sweepNoShows ne fait rien si le verrou est détenu par une autre instance', async () => {
    const { cron, repo, redis } = build({ locked: true });
    await cron.sweepNoShows();
    expect(redis.tryLock).toHaveBeenCalledWith('cron:no-show', expect.any(Number));
    expect(repo.findOverdueScheduled).not.toHaveBeenCalled();
  });

  it('sweepNoShows balaye les no-show si le verrou est acquis', async () => {
    const { cron, repo } = build({ locked: false });
    await cron.sweepNoShows();
    expect(repo.findOverdueScheduled).toHaveBeenCalledTimes(1);
  });

  it('désactivé (APPOINTMENT_CRON_ENABLED=false) : ne prend même pas le verrou', async () => {
    const { cron, redis, repo } = build({ enabled: false });
    await cron.scanReminders();
    await cron.sweepNoShows();
    expect(redis.tryLock).not.toHaveBeenCalled();
    expect(repo.findScheduledBetween).not.toHaveBeenCalled();
    expect(repo.findOverdueScheduled).not.toHaveBeenCalled();
  });
});
