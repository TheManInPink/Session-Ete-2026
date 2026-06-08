/**
 * @file        slots.util.ts
 * @description Génération de la grille de créneaux d'un centre et calcul de
 *              disponibilité. Fonctions PURES (aucune I/O) ⇒ testables en
 *              isolation. Le découpage STANDARD vs PRIORITAIRE suit la fenêtre
 *              réservée aux personnes vulnérables (ex. 07:00–09:00).
 *
 *              Règle de capacité (à 3 niveaux, le plus contraignant gagne) :
 *                1. par créneau   : `parallelDesks` (guichets simultanés) ;
 *                2. par nature/jour : `standardQuota` / `priorityQuota` ;
 *                3. par jour       : `capacityPerDay` (plafond global).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import {
  atMinutesUtc,
  dayKeyOf,
  hhmmToMinutes,
  utcDateKey,
  utcMinutesOfDay,
} from '../common/time.util.js';
import type {
  AvailabilitySlot,
  CenterSlotConfig,
  DayAvailability,
  DayOccupancy,
  OpeningHours,
  SlotKind,
} from './center.types.js';

/** Détermine la nature d'un créneau selon la fenêtre prioritaire. */
export function classifyKind(minutes: number, fromMin: number, toMin: number): SlotKind {
  return minutes >= fromMin && minutes < toMin ? 'PRIORITY' : 'STANDARD';
}

/** Un point de départ de créneau (date + minutes depuis minuit + nature). */
export interface SlotStart {
  start: Date;
  minutes: number;
  kind: SlotKind;
}

/**
 * Renvoie la plage d'ouverture `[ouverture, fermeture]` (en minutes) pour le
 * jour de `dayStart`, ou `null` si le centre est fermé ce jour-là.
 */
function openingRange(openingHours: OpeningHours, dayStart: Date): [number, number] | null {
  const hours = openingHours[dayKeyOf(dayStart)];
  if (!hours) return null;
  const [open, close] = hours;
  const from = hhmmToMinutes(open);
  const to = hhmmToMinutes(close);
  return to > from ? [from, to] : null;
}

/**
 * Construit la grille des créneaux d'une journée (vide si fermé).
 *
 * @param config   Configuration du centre.
 * @param dayStart Début de journée UTC visé.
 * @returns Les débuts de créneaux ordonnés.
 */
export function daySlotStarts(config: CenterSlotConfig, dayStart: Date): SlotStart[] {
  const range = openingRange(config.openingHours, dayStart);
  if (!range) return [];
  const [from, to] = range;
  const step = config.slotDurationMin;
  const out: SlotStart[] = [];
  // Dernier créneau commençant tel qu'il finit AU PLUS TARD à la fermeture.
  for (let m = from; m + step <= to; m += step) {
    out.push({
      start: atMinutesUtc(dayStart, m),
      minutes: m,
      kind: classifyKind(m, config.priorityFromMin, config.priorityToMin),
    });
  }
  return out;
}

/** Indique si le centre est ouvert à l'instant `at` (selon `openingHours`). */
export function isOpenAt(openingHours: OpeningHours, at: Date): boolean {
  const range = openingRange(openingHours, at);
  if (!range) return false;
  const minutes = utcMinutesOfDay(at);
  return minutes >= range[0] && minutes < range[1];
}

/**
 * Calcule la disponibilité d'une journée en soustrayant l'occupation observée.
 *
 * @param config   Configuration du centre.
 * @param dayStart Début de journée UTC.
 * @param occ      Occupation (comptes de RDV actifs).
 * @returns Disponibilités détaillées + récapitulatif quotas.
 */
export function computeDayAvailability(
  config: CenterSlotConfig,
  dayStart: Date,
  occ: DayOccupancy,
): DayAvailability {
  const date = utcDateKey(dayStart);
  const starts = daySlotStarts(config, dayStart);
  if (starts.length === 0) {
    return {
      date,
      open: false,
      slots: [],
      summary: { standardRemaining: 0, priorityRemaining: 0, capacityRemaining: 0 },
    };
  }

  const standardRemaining = Math.max(0, config.standardQuota - occ.standardCount);
  const priorityRemaining = Math.max(0, config.priorityQuota - occ.priorityCount);
  const capacityRemaining = Math.max(0, config.capacityPerDay - occ.total);

  const slots: AvailabilitySlot[] = starts.map((s) => {
    const iso = s.start.toISOString();
    const booked = occ.perSlot.get(iso) ?? 0;
    const perSlotRemaining = Math.max(0, config.parallelDesks - booked);
    const kindRemaining = s.kind === 'PRIORITY' ? priorityRemaining : standardRemaining;
    const remaining = Math.min(perSlotRemaining, kindRemaining, capacityRemaining);
    return { start: iso, kind: s.kind, capacity: config.parallelDesks, booked, remaining };
  });

  return {
    date,
    open: true,
    slots,
    summary: { standardRemaining, priorityRemaining, capacityRemaining },
  };
}
