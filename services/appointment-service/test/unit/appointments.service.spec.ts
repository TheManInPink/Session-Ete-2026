/**
 * @file        appointments.service.spec.ts
 * @description Tests du cœur métier des RDV : création (blacklist, vulnérabilité,
 *              créneau/quota), cycle de vie (annulation, check-in, clôture) et
 *              no-show + blacklist. Tous les collaborateurs sont mockés.
 * @module      appointment-service/test
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

// `@nina-aes/database` est un package ESM : on le mocke pour le runtime CommonJS
// de Jest. Le service n'appelle jamais Prisma (repo mocké) ; seul le garde
// d'idempotence référence `Prisma.PrismaClientKnownRequestError`.
jest.mock('@nina-aes/database', () => ({
  prisma: {},
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code = '';
    },
  },
}));

import { AppointmentsService } from '../../src/appointments/appointments.service.js';
import { SlotFullError } from '../../src/appointments/appointment.repository.js';
import { AppointmentStatus } from '../../src/appointments/appointment.enums.js';

const NOW = new Date('2026-06-08T00:00:00.000Z');
const SLOT_ISO = '2026-09-01T08:00:00.000Z';

/** Construit une ligne RDV de test. */
function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    citizenId: 'cit-1',
    centerId: 'ctr-1',
    scheduledAt: new Date(SLOT_ISO),
    status: AppointmentStatus.SCHEDULED,
    priority: 'P3',
    purpose: 'Première inscription',
    queueNumber: null,
    completedAt: null,
    createdAt: NOW,
    citizen: {
      id: 'cit-1',
      firstName: 'Awa',
      lastName: 'Diarra',
      phoneNumber: '+22370000000',
      preferredLanguage: 'FR',
    },
    center: { id: 'ctr-1', name: 'CTDEC Bamako', code: 'CTDEC-BAMAKO' },
    ...over,
  };
}

/** Slot d'availability configurable. */
function availability(kind: 'STANDARD' | 'PRIORITY', remaining: number) {
  return {
    centerId: 'ctr-1',
    days: [
      {
        date: '2026-09-01',
        open: true,
        slots: [{ start: SLOT_ISO, kind, capacity: 2, booked: 0, remaining }],
        summary: { standardRemaining: 10, priorityRemaining: 5, capacityRemaining: 20 },
      },
    ],
  };
}

function build(
  overrides: {
    repo?: Record<string, unknown>;
    centers?: Record<string, unknown>;
    queue?: Record<string, unknown>;
    publisher?: Record<string, unknown>;
    redis?: Record<string, unknown>;
  } = {},
) {
  const repo = {
    findCitizen: jest.fn().mockResolvedValue({
      id: 'cit-1',
      phoneNumber: '+22370000000',
      preferredLanguage: 'FR',
      vulnerabilityCategory: null,
    }),
    hasActiveVulnerability: jest.fn().mockResolvedValue(true),
    createBookingAtomic: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) => Promise.resolve(makeRow(data))),
    findById: jest.fn().mockResolvedValue(makeRow()),
    list: jest.fn().mockResolvedValue([]),
    transition: jest.fn().mockResolvedValue(true),
    updateStatus: jest
      .fn()
      .mockImplementation((id: string, patch: Record<string, unknown>) =>
        Promise.resolve(makeRow({ id, ...patch })),
      ),
    findInternalUserId: jest.fn().mockResolvedValue('user-uuid'),
    countNoShowsSince: jest.fn().mockResolvedValue(0),
    findByIds: jest.fn().mockResolvedValue([]),
    ...overrides.repo,
  };
  const centers = {
    getAvailability: jest.fn().mockResolvedValue(availability('STANDARD', 2)),
    getCenter: jest.fn().mockResolvedValue({
      id: 'ctr-1',
      slotDurationMin: 15,
      parallelDesks: 2,
      capacityPerDay: 100,
      standardQuota: 80,
      priorityQuota: 20,
      priorityWindow: { from: '07:00', to: '09:00' },
    }),
    ...overrides.centers,
  };
  const queue = {
    enqueue: jest.fn().mockResolvedValue(true),
    position: jest
      .fn()
      .mockResolvedValue({ position: 3, peopleAhead: 2, queueSize: 3, estimatedWaitMin: 30 }),
    remove: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    ...overrides.queue,
  };
  const publisher = { publish: jest.fn().mockResolvedValue(true), ...overrides.publisher };
  const redis = {
    isBlacklisted: jest.fn().mockResolvedValue(false),
    ttl: jest.fn().mockResolvedValue(-2),
    setBlacklist: jest.fn().mockResolvedValue(undefined),
    ...overrides.redis,
  };
  const cfg = {
    get: (k: string) =>
      (
        ({
          APPOINTMENT_NOSHOW_WINDOW_DAYS: 90,
          APPOINTMENT_NOSHOW_THRESHOLD: 2,
          APPOINTMENT_BLACKLIST_TTL_HOURS: 48,
        }) as Record<string, number>
      )[k],
  };
  const service = new AppointmentsService(
    cfg as never,
    repo as never,
    centers as never,
    queue as never,
    publisher as never,
    redis as never,
  );
  return { service, repo, centers, queue, publisher, redis };
}

const baseInput = {
  citizenId: 'cit-1',
  centerId: 'ctr-1',
  slot: SLOT_ISO,
  reason: 'Première inscription',
};

describe('AppointmentsService.create', () => {
  it('crée un RDV standard et publie la confirmation', async () => {
    const { service, repo, publisher } = build();
    const view = await service.create(baseInput, NOW);

    expect(repo.createBookingAtomic).toHaveBeenCalledTimes(1);
    const [data, cap] = repo.createBookingAtomic.mock.calls[0];
    expect(data.priority).toBe('P3');
    expect(cap.perSlotCapacity).toBe(2);
    expect(cap.capacityPerDay).toBe(100);
    expect(cap.standardQuota).toBe(80);
    expect(view.status).toBe('SCHEDULED');
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish.mock.calls[0][0]).toMatchObject({
      template: 'appointment-confirmed',
      idempotencyKey: 'appt:appt-1:confirm',
      channel: 'sms',
    });
  });

  it('refuse si le citoyen est blacklisté (no-show)', async () => {
    const { service, repo } = build({
      redis: { isBlacklisted: jest.fn().mockResolvedValue(true) },
    });
    await expect(service.create(baseInput, NOW)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.createBookingAtomic).not.toHaveBeenCalled();
  });

  it('crée un RDV PRIORITAIRE (P1) si la vulnérabilité est vérifiée', async () => {
    const { service, repo } = build({
      centers: { getAvailability: jest.fn().mockResolvedValue(availability('PRIORITY', 2)) },
    });
    const view = await service.create({ ...baseInput, vulnerabilityCategory: 'ELDERLY' }, NOW);
    expect(repo.hasActiveVulnerability).toHaveBeenCalled();
    expect(repo.createBookingAtomic.mock.calls[0][0].priority).toBe('P1');
    expect(view.status).toBe('SCHEDULED');
  });

  it('refuse un créneau PRIORITAIRE à un non-vulnérable', async () => {
    const { service } = build({
      centers: { getAvailability: jest.fn().mockResolvedValue(availability('PRIORITY', 2)) },
    });
    await expect(service.create(baseInput, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse si la vulnérabilité déclarée n’est pas vérifiée', async () => {
    const { service } = build({
      repo: { hasActiveVulnerability: jest.fn().mockResolvedValue(false) },
    });
    await expect(
      service.create({ ...baseInput, vulnerabilityCategory: 'PREGNANT' }, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un créneau complet', async () => {
    const { service } = build({
      centers: { getAvailability: jest.fn().mockResolvedValue(availability('STANDARD', 0)) },
    });
    await expect(service.create(baseInput, NOW)).rejects.toBeInstanceOf(ConflictException);
  });

  it('mappe SlotFullError (course perdue) en 409', async () => {
    const { service } = build({
      repo: { createBookingAtomic: jest.fn().mockRejectedValue(new SlotFullError()) },
    });
    await expect(service.create(baseInput, NOW)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AppointmentsService cycle de vie', () => {
  it('annule un RDV et publie l’annulation', async () => {
    const { service, repo, queue, publisher } = build();
    await service.cancel('appt-1');
    expect(repo.transition).toHaveBeenCalledWith(
      'appt-1',
      ['REQUESTED', 'SCHEDULED', 'CONFIRMED'],
      'CANCELLED',
    );
    expect(queue.remove).toHaveBeenCalled();
    expect(publisher.publish.mock.calls[0][0]).toMatchObject({ template: 'appointment-cancelled' });
  });

  it('rejette l’annulation si la transition échoue (déjà clôturé)', async () => {
    const { service } = build({ repo: { transition: jest.fn().mockResolvedValue(false) } });
    await expect(service.cancel('appt-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('check-in : confirme, met en file et attribue un numéro', async () => {
    const { service, queue, repo } = build({
      // findById reflète l'état persisté après le CAS gardé (queueNumber écrit).
      repo: { findById: jest.fn().mockResolvedValue(makeRow({ queueNumber: 3 })) },
    });
    const res = await service.checkIn('appt-1', { userId: 'kc-sub', role: 'agent', mfa: false });
    expect(repo.transition).toHaveBeenCalledWith('appt-1', ['SCHEDULED'], 'CONFIRMED', {
      agentId: 'user-uuid',
    });
    expect(queue.enqueue).toHaveBeenCalled();
    expect(res.queue.position).toBe(3);
    expect(res.queueNumber).toBe(3);
  });

  it('check-in : ne ré-écrit PAS un RDV annulé en concurrence (CAS gardé)', async () => {
    // 1re transition (SCHEDULED→CONFIRMED) OK, 2e (CONFIRMED→CONFIRMED) échoue
    // ⇒ le RDV a changé d'état entre-temps : pas de résurrection, conflit + retrait file.
    const { service, queue } = build({
      repo: {
        transition: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      },
    });
    await expect(
      service.checkIn('appt-1', { userId: 'kc-sub', role: 'agent', mfa: false }),
    ).rejects.toThrow(/interrompu/i);
    expect(queue.remove).toHaveBeenCalled();
  });

  it('check-in : mode dégradé si Redis indisponible (enqueue=false ⇒ pas de numéro)', async () => {
    const { service, repo } = build({
      repo: { findById: jest.fn().mockResolvedValue(makeRow({ queueNumber: null })) },
      queue: { enqueue: jest.fn().mockResolvedValue(false) },
    });
    const res = await service.checkIn('appt-1', { userId: 'kc-sub', role: 'agent', mfa: false });
    expect(res.queue.position).toBe(0); // pas de position en mode dégradé
    // le CAS gardé écrit queueNumber=null (et non un faux « 0 »)
    expect(repo.transition).toHaveBeenLastCalledWith('appt-1', ['CONFIRMED'], 'CONFIRMED', {
      queueNumber: null,
    });
  });

  it('clôture un RDV servi', async () => {
    const { service, repo, queue } = build();
    await service.complete('appt-1', { userId: 'kc-sub', role: 'agent', mfa: false });
    expect(repo.transition).toHaveBeenCalledWith(
      'appt-1',
      ['CONFIRMED', 'SCHEDULED'],
      'COMPLETED',
      expect.objectContaining({ agentId: 'user-uuid' }),
    );
    expect(queue.remove).toHaveBeenCalled();
  });
});

describe('AppointmentsService.list', () => {
  it('exige un filtre de portée (citizenId ou centerId) — anti vidage de masse', async () => {
    const { service } = build();
    await expect(service.list({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list({ status: 'SCHEDULED' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pagine, borne la taille de page (≤ 200) et calcule le skip', async () => {
    const { service, repo } = build({ repo: { list: jest.fn().mockResolvedValue([makeRow()]) } });
    const res = await service.list({ centerId: 'ctr-1', page: 2, pageSize: 500 });
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(200); // plafonné
    expect(res.items).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ centerId: 'ctr-1', skip: 200, take: 200 }),
    );
  });
});

describe('AppointmentsService.markNoShow', () => {
  it('marque NO_SHOW et blackliste au-delà du seuil', async () => {
    const { service, redis } = build({
      repo: {
        transition: jest.fn().mockResolvedValue(true),
        countNoShowsSince: jest.fn().mockResolvedValue(2),
      },
    });
    const flagged = await service.markNoShow(makeRow() as never, NOW);
    expect(flagged).toBe(true);
    expect(redis.setBlacklist).toHaveBeenCalled();
  });

  it('marque NO_SHOW sans blacklist sous le seuil', async () => {
    const { service, redis } = build({
      repo: {
        transition: jest.fn().mockResolvedValue(true),
        countNoShowsSince: jest.fn().mockResolvedValue(1),
      },
    });
    await service.markNoShow(makeRow() as never, NOW);
    expect(redis.setBlacklist).not.toHaveBeenCalled();
  });

  it('ne fait rien si la transition NO_SHOW échoue (déjà non-SCHEDULED)', async () => {
    const { service, redis } = build({ repo: { transition: jest.fn().mockResolvedValue(false) } });
    const flagged = await service.markNoShow(makeRow() as never, NOW);
    expect(flagged).toBe(false);
    expect(redis.setBlacklist).not.toHaveBeenCalled();
  });
});
