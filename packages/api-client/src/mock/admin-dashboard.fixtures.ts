/**
 * @file        admin-dashboard.fixtures.ts
 * @description Fixtures déterministes du dashboard admin (AD-01 / AD-03).
 *
 *              Reprend les MÊMES chiffres que `apps/admin/lib/mock-dashboard.ts`
 *              (mêmes graines Mulberry32 : 11/22/33/44 pour les sparklines, 55
 *              pour la série corrections/jour, 66 pour le feed d'alertes) afin
 *              de garantir la stabilité des e2e admin lors de la bascule vers
 *              `api.adminDashboard.getStats()`. Seules les DATES diffèrent :
 *              elles sont ancrées sur `FIXED_NOW` (déterministes) au lieu de
 *              `Date.now()` — l'app ne les affichait que comme libellés relatifs.
 *
 * @module      @nina-aes/api-client
 */

import {
  AdminDashboardStatsSchema,
  type AdminDashboardStats,
  type AdminKpiSnapshot,
  type AgentIntegrity,
  type AlertEntry,
  type DailyCorrectionCount,
  type RegionActivity,
} from '../admin-dashboard/admin-dashboard.schema';
import { FIXED_EPOCH, isoDayBefore, mulberry32 } from './deterministic';

/** Sparkline 30 jours — réplique exacte de `generateHistory` (mock-dashboard). */
function generateHistory(seed: number, base: number, variance = 0.15): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: 30 }, (_, i) => {
    // Tendance globale ascendante (+15 % sur 30j) + bruit
    const trend = base * (1 + (i / 30) * variance);
    const noise = base * variance * (rand() - 0.5);
    return Math.max(0, Math.round(trend + noise));
  });
}

/** KPIs du jour (mêmes valeurs qu'AD-01, sans les concerns de vue tone/drillTo). */
const KPI_SNAPSHOTS: readonly AdminKpiSnapshot[] = [
  { key: 'ninaActive', value: 12_489, weekDelta: +2.4, history: generateHistory(11, 12200, 0.04) },
  { key: 'correctionsPending', value: 84, weekDelta: -12.5, history: generateHistory(22, 95, 0.3) },
  { key: 'alertsOpen', value: 17, weekDelta: +6.3, history: generateHistory(33, 14, 0.4) },
  {
    key: 'appointmentsToday',
    value: 326,
    weekDelta: +1.8,
    history: generateHistory(44, 310, 0.1),
  },
];

/** Série corrections/jour 30 j — mêmes valeurs (graine 55), dates ancrées FIXED_NOW. */
function buildCorrectionsPerDay(): DailyCorrectionCount[] {
  const rand = mulberry32(55);
  const points: DailyCorrectionCount[] = [];
  for (let i = 29; i >= 0; i--) {
    // Volume base 60-90, pics 100+ certains jours
    const base = 65 + rand() * 25;
    const spike = rand() > 0.85 ? 25 : 0;
    points.push({ date: isoDayBefore(i), count: Math.round(base + spike) });
  }
  return points;
}

/** Activité régionale (corrections traitées, 30 j) — codes ISO ML-xx. */
const ACTIVITY_BY_REGION: readonly RegionActivity[] = [
  { regionCode: 'ML-09', value: 487 },
  { regionCode: 'ML-03', value: 312 },
  { regionCode: 'ML-02', value: 268 },
  { regionCode: 'ML-04', value: 234 },
  { regionCode: 'ML-01', value: 198 },
  { regionCode: 'ML-05', value: 156 },
  { regionCode: 'ML-06', value: 89 },
  { regionCode: 'ML-07', value: 67 },
  { regionCode: 'ML-19', value: 54 },
  { regionCode: 'ML-08', value: 12 },
];

/** Alertes SIGAC actives par région (heatmap AD-03). */
const ALERTS_BY_REGION: readonly RegionActivity[] = [
  { regionCode: 'ML-09', value: 9 },
  { regionCode: 'ML-03', value: 4 },
  { regionCode: 'ML-05', value: 3 },
  { regionCode: 'ML-04', value: 2 },
  { regionCode: 'ML-01', value: 2 },
  { regionCode: 'ML-07', value: 1 },
];

/** Top 10 agents intégrité (AD-03) — identique à mock-dashboard. */
const TOP_AGENTS: readonly AgentIntegrity[] = [
  {
    id: 'a-001',
    name: 'Modibo Konaté',
    score: 97,
    centerCode: 'CTDEC Bamako',
    matricule: 'CTDEC-2024-0156',
  },
  {
    id: 'a-002',
    name: 'Aminata Touré',
    score: 95,
    centerCode: 'CTDEC Bamako',
    matricule: 'CTDEC-2024-0142',
  },
  {
    id: 'a-003',
    name: 'Mariam Sissoko',
    score: 92,
    centerCode: 'RAVEC Kayes',
    matricule: 'RAVEC-2024-0089',
  },
  {
    id: 'a-004',
    name: 'Ibrahim Diallo',
    score: 88,
    centerCode: 'CTDEC Sikasso',
    matricule: 'CTDEC-2024-0211',
  },
  {
    id: 'a-005',
    name: 'Fatoumata Coulibaly',
    score: 84,
    centerCode: 'CTDEC Bamako',
    matricule: 'CTDEC-2024-0177',
  },
  {
    id: 'a-006',
    name: 'Souleymane Traoré',
    score: 78,
    centerCode: 'CTDEC Ségou',
    matricule: 'CTDEC-2024-0094',
  },
  {
    id: 'a-007',
    name: 'Aïcha Diarra',
    score: 72,
    centerCode: 'RAVEC Mopti',
    matricule: 'RAVEC-2024-0067',
  },
  {
    id: 'a-008',
    name: 'Oumar Cissé',
    score: 58,
    centerCode: 'CTDEC Sikasso',
    matricule: 'CTDEC-2024-0203',
  },
  {
    id: 'a-009',
    name: 'Fanta Doumbia',
    score: 42,
    centerCode: 'CTDEC Bamako',
    matricule: 'CTDEC-2024-0188',
  },
  {
    id: 'a-010',
    name: 'Boubacar Maïga',
    score: 31,
    centerCode: 'RAVEC Kayes',
    matricule: 'RAVEC-2024-0091',
  },
];

/** Feed d'alertes initial (8 entrées) — reçues 5-29 h avant FIXED_NOW (graine 66). */
function buildInitialAlerts(): AlertEntry[] {
  const rand = mulberry32(66);
  const samples: Array<
    Pick<AlertEntry, 'severity' | 'category' | 'shortDescription' | 'location'>
  > = [
    {
      severity: 'CRITICAL',
      category: 'FORGERY',
      shortDescription: 'Tentative usurpation NINA — falsification photo',
      location: 'CTDEC Bamako',
    },
    {
      severity: 'HIGH',
      category: 'BRIBERY',
      shortDescription: 'Pot-de-vin allégué — file P1 RDV',
      location: 'CTDEC Sikasso',
    },
    {
      severity: 'MEDIUM',
      category: 'FAVORITISM',
      shortDescription: 'Traitement prioritaire signalé sans motif',
      location: 'Mairie Comm. IV',
    },
    {
      severity: 'HIGH',
      category: 'FORGERY',
      shortDescription: 'Document antériorité douteux',
      location: 'DNEC',
    },
    {
      severity: 'CRITICAL',
      category: 'ABUSE_OF_POWER',
      shortDescription: 'Pression sur agent — chaîne hiérarchique',
      location: 'Gouvernorat Mopti',
    },
    {
      severity: 'MEDIUM',
      category: 'PROCUREMENT',
      shortDescription: 'Fournisseur unique signalé sur 3 marchés',
      location: 'CTDEC Bamako',
    },
    {
      severity: 'LOW',
      category: 'OTHER',
      shortDescription: 'Plainte sur délai de traitement >30j',
      location: 'CTDEC Ségou',
    },
    {
      severity: 'MEDIUM',
      category: 'BRIBERY',
      shortDescription: 'Demande paiement « frais accélération »',
      location: 'RAVEC Kayes',
    },
  ];

  return samples.map((s, i) => ({
    id: `alert-${String(i + 1).padStart(4, '0')}`,
    ...s,
    receivedAt: new Date(FIXED_EPOCH - (5 + rand() * 24) * 60 * 60 * 1000).toISOString(),
  }));
}

/**
 * Statistiques mock complètes du dashboard. `correctionsToday` = dernier point
 * de la série (jour de `FIXED_NOW`). NB : `correctionsPending` (84) reflète le
 * KPI AD-01, pas le magasin mock des corrections (~31 UNDER_REVIEW) — les deux
 * sources sont volontairement indépendantes pour préserver les e2e existants.
 */
export function buildMockAdminDashboardStats(): AdminDashboardStats {
  const correctionsPerDay = buildCorrectionsPerDay();
  return AdminDashboardStatsSchema.parse({
    correctionsPending: 84,
    correctionsToday: correctionsPerDay[correctionsPerDay.length - 1]!.count,
    correctionsPerDay,
    activityByRegion: [...ACTIVITY_BY_REGION],
    alertsByRegion: [...ALERTS_BY_REGION],
    kpis: [...KPI_SNAPSHOTS],
    topAgents: [...TOP_AGENTS],
    alerts: buildInitialAlerts(),
  });
}
