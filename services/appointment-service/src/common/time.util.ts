/**
 * @file        time.util.ts
 * @description Helpers temporels. **Le Mali est à UTC+0 toute l'année** (pas de
 *              changement d'heure) : on raisonne donc directement en UTC, ce qui
 *              évite toute dépendance à une librairie de fuseaux. Si un jour un
 *              centre opère hors UTC (diaspora), il faudra convertir via
 *              `EnrollmentCenter.timezone`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/common
 */

/** Clés de jour de semaine utilisées dans `openingHours`. */
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** Clé de jour (lun..dim) d'une date, en UTC. */
export function dayKeyOf(date: Date): DayKey {
  return DAY_KEYS[date.getUTCDay()]!;
}

/** Clé de date `YYYY-MM-DD` (UTC) — sert d'identifiant de file et de bornage. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Début de journée UTC (00:00:00.000) de la date donnée. */
export function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Convertit "HH:mm" en minutes depuis minuit (ex. "08:30" → 510). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/** Convertit des minutes depuis minuit en "HH:mm" (ex. 510 → "08:30"). */
export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Construit une date UTC à partir d'un début de journée + minutes. */
export function atMinutesUtc(dayStart: Date, minutes: number): Date {
  return new Date(dayStart.getTime() + minutes * 60_000);
}

/** Minutes depuis minuit (UTC) d'une date. */
export function utcMinutesOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/** Formate une date en français long (ex. "lundi 8 juin 2026"), en UTC. */
export function formatFrDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Formate l'heure "HH:mm" (UTC) d'une date. */
export function formatFrTime(date: Date): string {
  return minutesToHhmm(utcMinutesOfDay(date));
}

/** Formate date + heure en français (ex. "lundi 8 juin 2026 à 08:30"). */
export function formatFrDateTime(date: Date): string {
  return `${formatFrDate(date)} à ${formatFrTime(date)}`;
}
