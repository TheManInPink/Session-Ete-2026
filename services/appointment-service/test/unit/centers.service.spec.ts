/**
 * @file        centers.service.spec.ts
 * @description Tests de la projection + filtres des centres et du calcul de
 *              disponibilité (orchestration).
 * @module      appointment-service/test
 */
jest.mock('@nina-aes/database', () => ({ prisma: {}, Prisma: {} }));

import { CentersService } from '../../src/centers/centers.service.js';
import type { CenterRow } from '../../src/centers/centers.repository.js';

const OPEN_ALL: Record<string, [string, string]> = {
  mon: ['08:00', '16:00'],
  tue: ['08:00', '16:00'],
  wed: ['08:00', '16:00'],
  thu: ['08:00', '16:00'],
  fri: ['08:00', '16:00'],
  sat: ['08:00', '16:00'],
  sun: ['08:00', '16:00'],
};

/** Fabrique une ligne centre minimale (champs lus par le service). */
function center(o: {
  id: string;
  code: string;
  name: string;
  locationCode: string | null;
  lat: number;
  lng: number;
  services?: string[];
  open?: boolean;
}): CenterRow {
  return {
    id: `ec-${o.id}`,
    institutionId: o.id,
    servicesOffered: o.services ?? ['ENROLLMENT', 'CORRECTION', 'INFO'],
    capacityPerDay: 100,
    slotDurationMin: 15,
    parallelDesks: 2,
    standardQuota: 80,
    priorityQuota: 20,
    priorityFrom: '07:00',
    priorityTo: '09:00',
    openingHours: o.open === false ? { mon: null } : OPEN_ALL,
    latitude: o.lat,
    longitude: o.lng,
    timezone: 'Africa/Bamako',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    institution: {
      id: o.id,
      code: o.code,
      name: o.name,
      type: 'ANTENNE_RAVEC',
      parentId: null,
      locationId: o.locationCode ? `loc-${o.id}` : null,
      address: null,
      phoneNumber: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      location: o.locationCode ? { id: `loc-${o.id}`, code: o.locationCode, name: o.code } : null,
    },
  } as unknown as CenterRow;
}

function build(rows: CenterRow[], schedules: { scheduledAt: Date }[] = []) {
  const repo = {
    findActiveCenters: jest.fn().mockResolvedValue(rows),
    findByInstitutionId: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(rows.find((r) => r.institutionId === id) ?? null),
      ),
    findLocationNames: jest.fn().mockResolvedValue(new Map<string, string>()),
    findActiveSchedules: jest.fn().mockResolvedValue(schedules),
  };
  const cfg = { get: () => 30 }; // APPOINTMENT_BOOKING_HORIZON_DAYS
  const service = new CentersService(cfg as never, repo as never);
  return { service, repo };
}

const BAMAKO = {
  id: 'i-bko',
  code: 'CTDEC-BAMAKO',
  name: 'CTDEC',
  locationCode: 'ML-09',
  lat: 12.64,
  lng: -8.0,
};
const KATI = {
  id: 'i-kati',
  code: 'ANTENNE-KATI',
  name: 'Kati',
  locationCode: 'ML-02-04',
  lat: 12.74,
  lng: -8.07,
};
const KAYES = {
  id: 'i-kayes',
  code: 'ANTENNE-KAYES',
  name: 'Kayes',
  locationCode: 'ML-01-01',
  lat: 14.45,
  lng: -11.44,
};

const NOON = new Date('2026-06-08T12:00:00.000Z');

describe('CentersService.listCenters', () => {
  it('filtre par code région (préfixe)', async () => {
    const { service } = build([center(BAMAKO), center(KATI), center(KAYES)]);
    const res = await service.listCenters({ regionCode: 'ML-02' }, NOON);
    expect(res.map((c) => c.code)).toEqual(['ANTENNE-KATI']);
  });

  it('filtre par code cercle (préfixe)', async () => {
    const { service } = build([center(KATI), center(KAYES)]);
    const res = await service.listCenters({ cercleCode: 'ML-01-01' }, NOON);
    expect(res.map((c) => c.code)).toEqual(['ANTENNE-KAYES']);
  });

  it('filtre par service offert', async () => {
    const { service } = build([
      center({ ...KATI, services: ['ENROLLMENT'] }),
      center({ ...KAYES, services: ['INFO'] }),
    ]);
    const res = await service.listCenters({ service: 'ENROLLMENT' }, NOON);
    expect(res.map((c) => c.code)).toEqual(['ANTENNE-KATI']);
  });

  it('filtre les centres ouverts maintenant', async () => {
    const { service } = build([center(KATI), center({ ...KAYES, open: false })]);
    const res = await service.listCenters({ openNow: true }, NOON);
    expect(res.map((c) => c.code)).toEqual(['ANTENNE-KATI']);
  });

  it('recherche géographique : calcule la distance, filtre par rayon, trie', async () => {
    const { service } = build([center(KAYES), center(BAMAKO), center(KATI)]);
    // Point ≈ Bamako : Bamako/Kati proches, Kayes ~600 km → exclu par rayon 100 km.
    const res = await service.listCenters({ lat: 12.64, lng: -8.0, radiusKm: 100 }, NOON);
    expect(res.map((c) => c.code)).toEqual(['CTDEC-BAMAKO', 'ANTENNE-KATI']);
    expect(res[0]!.distanceKm).toBeCloseTo(0, 1);
    expect(res[0]!.distanceKm!).toBeLessThan(res[1]!.distanceKm!);
  });
});

describe('CentersService.getAvailability', () => {
  it('renvoie des journées ouvertes avec créneaux pleinement disponibles', async () => {
    const { service } = build([center(BAMAKO)]);
    const dateKey = '2026-06-08';
    const { days } = await service.getAvailability('i-bko', dateKey, dateKey, NOON);
    expect(days).toHaveLength(1);
    expect(days[0]!.open).toBe(true);
    expect(days[0]!.slots.length).toBeGreaterThan(0);
    // Aucune réservation ⇒ chaque créneau offre `parallelDesks` (2) places.
    expect(days[0]!.slots.every((s) => s.remaining === 2)).toBe(true);
  });

  it('404 si le centre est inconnu', async () => {
    const { service } = build([center(BAMAKO)]);
    await expect(
      service.getAvailability('inconnu', '2026-06-08', '2026-06-08', NOON),
    ).rejects.toThrow();
  });
});
