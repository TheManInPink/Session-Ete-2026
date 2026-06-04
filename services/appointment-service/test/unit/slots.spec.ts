/**
 * @file        slots.spec.ts
 * @description Tests de la génération de créneaux et du calcul de disponibilité.
 * @module      appointment-service/test
 */
import {
  classifyKind,
  computeDayAvailability,
  daySlotStarts,
  isOpenAt,
} from '../../src/centers/slots.util.js';
import type { CenterSlotConfig, DayOccupancy } from '../../src/centers/center.types.js';

/** Config de test : ouvert tous les jours 08:00–10:00, fenêtre prioritaire 07:00–09:00. */
function config(over: Partial<CenterSlotConfig> = {}): CenterSlotConfig {
  const hours: [string, string] = ['08:00', '10:00'];
  return {
    slotDurationMin: 30,
    parallelDesks: 2,
    capacityPerDay: 100,
    standardQuota: 50,
    priorityQuota: 20,
    priorityFromMin: 7 * 60,
    priorityToMin: 9 * 60,
    openingHours: {
      mon: hours,
      tue: hours,
      wed: hours,
      thu: hours,
      fri: hours,
      sat: hours,
      sun: hours,
    },
    ...over,
  };
}

function emptyOcc(): DayOccupancy {
  return { perSlot: new Map(), standardCount: 0, priorityCount: 0, total: 0 };
}

describe('classifyKind', () => {
  it('classe PRIORITY dans la fenêtre [from, to[ et STANDARD ailleurs', () => {
    expect(classifyKind(7 * 60, 7 * 60, 9 * 60)).toBe('PRIORITY');
    expect(classifyKind(8 * 60 + 30, 7 * 60, 9 * 60)).toBe('PRIORITY');
    expect(classifyKind(9 * 60, 7 * 60, 9 * 60)).toBe('STANDARD'); // borne haute exclue
    expect(classifyKind(10 * 60, 7 * 60, 9 * 60)).toBe('STANDARD');
  });
});

describe('daySlotStarts', () => {
  it('génère la grille (08:00→09:30) et classe par fenêtre prioritaire', () => {
    const day = new Date('2026-06-08T00:00:00Z');
    const slots = daySlotStarts(config(), day);
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      '2026-06-08T08:00:00.000Z',
      '2026-06-08T08:30:00.000Z',
      '2026-06-08T09:00:00.000Z',
      '2026-06-08T09:30:00.000Z',
    ]);
    // 08:00 / 08:30 en fenêtre prioritaire ; 09:00 / 09:30 standard.
    expect(slots.map((s) => s.kind)).toEqual(['PRIORITY', 'PRIORITY', 'STANDARD', 'STANDARD']);
  });

  it('renvoie [] un jour fermé', () => {
    const day = new Date('2026-06-08T00:00:00Z');
    const slots = daySlotStarts(config({ openingHours: { mon: null } }), day);
    expect(slots).toEqual([]);
  });
});

describe('isOpenAt', () => {
  const hours: [string, string] = ['08:00', '10:00'];
  const oh = { mon: hours, tue: hours, wed: hours, thu: hours, fri: hours, sat: hours, sun: hours };

  it('vrai pendant les heures, faux en dehors', () => {
    expect(isOpenAt(oh, new Date('2026-06-08T09:00:00Z'))).toBe(true);
    expect(isOpenAt(oh, new Date('2026-06-08T07:59:00Z'))).toBe(false);
    expect(isOpenAt(oh, new Date('2026-06-08T10:00:00Z'))).toBe(false); // borne haute exclue
  });
});

describe('computeDayAvailability', () => {
  const day = new Date('2026-06-08T00:00:00Z');

  it('jour fermé ⇒ open=false, pas de créneaux', () => {
    const res = computeDayAvailability(config({ openingHours: { mon: null } }), day, emptyOcc());
    expect(res.open).toBe(false);
    expect(res.slots).toHaveLength(0);
  });

  it('plafonne le restant par capacité de créneau (parallelDesks)', () => {
    const occ = emptyOcc();
    occ.perSlot.set('2026-06-08T08:00:00.000Z', 2); // créneau plein (2 guichets)
    occ.total = 2;
    occ.priorityCount = 2;
    const res = computeDayAvailability(config(), day, occ);
    const first = res.slots.find((s) => s.start === '2026-06-08T08:00:00.000Z')!;
    expect(first.booked).toBe(2);
    expect(first.remaining).toBe(0);
  });

  it('plafonne le restant par quota de nature (standardQuota)', () => {
    // standardQuota = 1 ⇒ les créneaux STANDARD ne peuvent offrir qu'1 place.
    const res = computeDayAvailability(config({ standardQuota: 1 }), day, emptyOcc());
    const standard = res.slots.filter((s) => s.kind === 'STANDARD');
    for (const s of standard) expect(s.remaining).toBe(1);
    expect(res.summary.standardRemaining).toBe(1);
  });

  it('plafonne le restant par capacité quotidienne globale', () => {
    const occ = emptyOcc();
    occ.total = 99; // capacityPerDay=100 ⇒ il ne reste qu'1 place au total
    const res = computeDayAvailability(config(), day, occ);
    for (const s of res.slots) expect(s.remaining).toBeLessThanOrEqual(1);
    expect(res.summary.capacityRemaining).toBe(1);
  });
});
