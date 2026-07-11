/**
 * @file        schedule.ts
 * @description View-model DÉTERMINISTE du planning de rendez-vous du jour, côté
 *              agent (AD — Rendez-vous). Le contrat `appointment-service` (doc 09)
 *              n'expose, à ce jour, que des méthodes citoyen-scopées
 *              (`getAvailability` / `create` / `listMine` / `cancel`) — aucune
 *              agrégation « file du centre » côté agent. Cette couche fournit un
 *              planning de démonstration reproductible pour matérialiser l'écran.
 *
 *              HONNÊTETÉ : en mode live la page rend un état « indisponible »
 *              (aucune source backend agent) ; ce builder n'alimente QUE le mode
 *              mock. Réutilise les enums de domaine (`PriorityLevel`,
 *              `AppointmentStatus`) de `@nina-aes/api-client`. Aucun `Date.now`
 *              ni `Math.random` : heures en `HH:MM` littéral (e2e stable).
 *
 *              CONFIDENTIALITÉ : les identités citoyennes sont partiellement
 *              masquées à l'affichage (prénom + initiale) — minimisation des
 *              données pour une liste potentiellement exposée à l'écran.
 *
 * @module      @nina-aes/admin
 */

import type { AppointmentStatus, PriorityLevel } from '@nina-aes/api-client';

/** Une visite planifiée (ligne du planning agent). */
export interface ScheduledVisit {
  id: string;
  /** Heure d'appel, `HH:MM` (déterministe, sans date absolue). */
  time: string;
  /** Numéro de file du jour. */
  queueNumber: number;
  priority: PriorityLevel;
  status: AppointmentStatus;
  /** Référence citoyen partiellement masquée (prénom + initiale). */
  citizenRef: string;
  reason: string;
}

/** Compteurs agrégés d'une journée. */
export interface ScheduleTotals {
  total: number;
  confirmed: number;
  waiting: number;
  priority: number;
  completed: number;
  noShow: number;
}

/** Planning complet du jour pour un centre. */
export interface CenterSchedule {
  centerName: string;
  visits: ScheduledVisit[];
  totals: ScheduleTotals;
  /** Prochaine visite à appeler (SCHEDULED/CONFIRMED, dans l'ordre), sinon `null`. */
  nextUp: ScheduledVisit | null;
}

/** Mulberry32 — même famille de PRNG que les fixtures api-client. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Heures d'appel du jour (pause déjeuner 11:45 → 13:30). Déterministe.
const TIMES = [
  '08:00',
  '08:40',
  '09:15',
  '09:50',
  '10:30',
  '11:10',
  '13:30',
  '14:00',
  '14:45',
  '15:20',
];

// Statuts par rang : matinée traitée (dont un absent), imminents confirmés,
// puis planifiés — avec une annulation. Journée crédible d'un guichet CTDEC.
const STATUSES: AppointmentStatus[] = [
  'COMPLETED',
  'COMPLETED',
  'NO_SHOW',
  'CONFIRMED',
  'CONFIRMED',
  'SCHEDULED',
  'CANCELLED',
  'SCHEDULED',
  'SCHEDULED',
  'SCHEDULED',
];

// Priorités (2× P1, 3× P2, 5× P3) — le prochain appel (rang 3) est prioritaire.
const PRIORITIES: PriorityLevel[] = ['P3', 'P2', 'P3', 'P1', 'P3', 'P2', 'P3', 'P1', 'P3', 'P2'];

const FIRST_NAMES = [
  'Awa',
  'Moussa',
  'Fatoumata',
  'Ibrahim',
  'Mariam',
  'Souleymane',
  'Aïcha',
  'Oumar',
  'Kadidia',
  'Boubacar',
  'Djénéba',
  'Sékou',
];
const INITIALS = ['T.', 'D.', 'K.', 'C.', 'S.', 'M.', 'B.', 'N.', 'Dc.', 'Sy.'];
const REASONS = [
  'Correction état civil',
  'Enrôlement biométrique',
  'Retrait carte NINA',
  'Rendez-vous RAVEC — antenne mobile',
  'Mise à jour filiation',
  'Duplicata acte de naissance',
];

const ACTIVE: ReadonlySet<AppointmentStatus> = new Set(['SCHEDULED', 'CONFIRMED']);

/**
 * Construit le planning déterministe du jour pour le centre agent (mode mock).
 * Le centre est fixé sur CTDEC Bamako, cohérent avec les autres fixtures admin.
 */
export function buildMockCenterSchedule(): CenterSchedule {
  const rand = mulberry32(0x5c4ed);
  const centerName = 'CTDEC Bamako';

  const visits: ScheduledVisit[] = TIMES.map((time, i) => {
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]!;
    const initial = INITIALS[Math.floor(rand() * INITIALS.length)]!;
    const reason = REASONS[Math.floor(rand() * REASONS.length)]!;
    return {
      id: `visit-${String(i + 1).padStart(2, '0')}`,
      time,
      queueNumber: i + 1,
      priority: PRIORITIES[i]!,
      status: STATUSES[i]!,
      citizenRef: `${first} ${initial}`,
      reason,
    };
  });

  const totals: ScheduleTotals = {
    total: visits.length,
    confirmed: visits.filter((v) => v.status === 'CONFIRMED').length,
    waiting: visits.filter((v) => v.status === 'SCHEDULED').length,
    priority: visits.filter((v) => v.priority === 'P1').length,
    completed: visits.filter((v) => v.status === 'COMPLETED').length,
    noShow: visits.filter((v) => v.status === 'NO_SHOW').length,
  };

  const nextUp = visits.find((v) => ACTIVE.has(v.status)) ?? null;

  return { centerName, visits, totals, nextUp };
}
