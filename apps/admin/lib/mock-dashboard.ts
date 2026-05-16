/**
 * @file        mock-dashboard.ts
 * @description Fixtures déterministes pour AD-01 (Dashboard) et AD-03 (SIGAC).
 *              À supprimer Session 5+ quand les services backend
 *              (correction-service, anticorruption-service, audit-service)
 *              exposeront les vraies queries d'agrégation.
 *
 *              Données :
 *                - KPIs « du jour » + sparkline 30 jours
 *                - Série temporelle corrections/jour 30j (AreaChart AD-01)
 *                - Activité régionale (MaliHeatmap AD-01)
 *                - Activité régionale alertes (MaliHeatmap AD-03)
 *                - Top 10 agents intégrité (AD-03)
 *                - Feed alertes temps réel (AD-01 + AD-03)
 *
 * @module      @nina-aes/admin
 */

// ── PRNG déterministe Mulberry32 (cf. mock-corrections.ts) ──────────────────
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── KPIs du jour + sparkline 30 jours ───────────────────────────────────────
export interface KpiSnapshot {
  /** Identifiant de la métrique (clé i18n). */
  key: 'ninaActive' | 'correctionsPending' | 'alertsOpen' | 'appointmentsToday';
  /** Valeur affichée. */
  value: number;
  /** Variation depuis la semaine précédente (signed %). */
  weekDelta: number;
  /** 30 derniers jours pour la sparkline. */
  history: number[];
  /** Tonalité de la sparkline. */
  tone: 'primary' | 'success' | 'warning' | 'danger';
  /** Lien drill-down (`./corrections`, `./appointments`, `./sigac`). */
  drillTo: string | null;
}

function generateHistory(seed: number, base: number, variance = 0.15): number[] {
  const rand = rng(seed);
  return Array.from({ length: 30 }, (_, i) => {
    // Tendance globale ascendante (+15 % sur 30j) + bruit
    const trend = base * (1 + ((i / 30) * variance));
    const noise = base * variance * (rand() - 0.5);
    return Math.max(0, Math.round(trend + noise));
  });
}

export const KPI_SNAPSHOTS: readonly KpiSnapshot[] = [
  {
    key: 'ninaActive',
    value: 12_489,
    weekDelta: +2.4,
    history: generateHistory(11, 12200, 0.04),
    tone: 'primary',
    drillTo: null,
  },
  {
    key: 'correctionsPending',
    value: 84,
    weekDelta: -12.5,
    history: generateHistory(22, 95, 0.3),
    tone: 'warning',
    drillTo: 'corrections',
  },
  {
    key: 'alertsOpen',
    value: 17,
    weekDelta: +6.3,
    history: generateHistory(33, 14, 0.4),
    tone: 'danger',
    drillTo: 'sigac',
  },
  {
    key: 'appointmentsToday',
    value: 326,
    weekDelta: +1.8,
    history: generateHistory(44, 310, 0.1),
    tone: 'success',
    drillTo: 'appointments',
  },
];

// ── AreaChart corrections / jour 30j ────────────────────────────────────────
function formatDayLabel(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const CORRECTIONS_PER_DAY: ReadonlyArray<{ x: string; y: number }> = (() => {
  const rand = rng(55);
  const points: Array<{ x: string; y: number }> = [];
  for (let i = 29; i >= 0; i--) {
    // Volume base 60-90, pics 100+ certains jours
    const base = 65 + rand() * 25;
    const spike = rand() > 0.85 ? 25 : 0;
    points.push({ x: formatDayLabel(i), y: Math.round(base + spike) });
  }
  return points;
})();

// ── MaliHeatmap : activité régionale ────────────────────────────────────────
/** Activité = nombre de corrections traitées par région ces 30 derniers jours. */
export const ACTIVITY_BY_REGION: ReadonlyArray<{ regionCode: string; value: number; label: string }> = [
  { regionCode: 'ML-09', value: 487, label: 'Bamako : 487 corrections (30j)' },
  { regionCode: 'ML-03', value: 312, label: 'Sikasso : 312 corrections (30j)' },
  { regionCode: 'ML-02', value: 268, label: 'Koulikoro : 268 corrections (30j)' },
  { regionCode: 'ML-04', value: 234, label: 'Ségou : 234 corrections (30j)' },
  { regionCode: 'ML-01', value: 198, label: 'Kayes : 198 corrections (30j)' },
  { regionCode: 'ML-05', value: 156, label: 'Mopti : 156 corrections (30j)' },
  { regionCode: 'ML-06', value: 89, label: 'Tombouctou : 89 corrections (30j)' },
  { regionCode: 'ML-07', value: 67, label: 'Gao : 67 corrections (30j)' },
  { regionCode: 'ML-19', value: 54, label: 'Bandiagara : 54 corrections (30j)' },
  { regionCode: 'ML-08', value: 12, label: 'Kidal : 12 corrections (30j)' },
];

// ── MaliHeatmap : alertes SIGAC par région ──────────────────────────────────
export const ALERTS_BY_REGION: ReadonlyArray<{ regionCode: string; value: number; label: string }> = [
  { regionCode: 'ML-09', value: 9, label: 'Bamako : 9 alertes actives' },
  { regionCode: 'ML-03', value: 4, label: 'Sikasso : 4 alertes actives' },
  { regionCode: 'ML-05', value: 3, label: 'Mopti : 3 alertes actives' },
  { regionCode: 'ML-04', value: 2, label: 'Ségou : 2 alertes actives' },
  { regionCode: 'ML-01', value: 2, label: 'Kayes : 2 alertes actives' },
  { regionCode: 'ML-07', value: 1, label: 'Gao : 1 alerte active' },
];

// ── Top 10 agents intégrité (AD-03) ─────────────────────────────────────────
export interface AgentIntegrity {
  id: string;
  name: string;
  score: number;
  centerCode: string;
  matricule: string;
}

export const TOP_AGENTS: readonly AgentIntegrity[] = [
  { id: 'a-001', name: 'Modibo Konaté', score: 97, centerCode: 'CTDEC Bamako', matricule: 'CTDEC-2024-0156' },
  { id: 'a-002', name: 'Aminata Touré', score: 95, centerCode: 'CTDEC Bamako', matricule: 'CTDEC-2024-0142' },
  { id: 'a-003', name: 'Mariam Sissoko', score: 92, centerCode: 'RAVEC Kayes', matricule: 'RAVEC-2024-0089' },
  { id: 'a-004', name: 'Ibrahim Diallo', score: 88, centerCode: 'CTDEC Sikasso', matricule: 'CTDEC-2024-0211' },
  { id: 'a-005', name: 'Fatoumata Coulibaly', score: 84, centerCode: 'CTDEC Bamako', matricule: 'CTDEC-2024-0177' },
  { id: 'a-006', name: 'Souleymane Traoré', score: 78, centerCode: 'CTDEC Ségou', matricule: 'CTDEC-2024-0094' },
  { id: 'a-007', name: 'Aïcha Diarra', score: 72, centerCode: 'RAVEC Mopti', matricule: 'RAVEC-2024-0067' },
  { id: 'a-008', name: 'Oumar Cissé', score: 58, centerCode: 'CTDEC Sikasso', matricule: 'CTDEC-2024-0203' },
  { id: 'a-009', name: 'Fanta Doumbia', score: 42, centerCode: 'CTDEC Bamako', matricule: 'CTDEC-2024-0188' },
  { id: 'a-010', name: 'Boubacar Maïga', score: 31, centerCode: 'RAVEC Kayes', matricule: 'RAVEC-2024-0091' },
];

// ── Feed alertes SIGAC ──────────────────────────────────────────────────────
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertCategory =
  | 'BRIBERY'
  | 'FORGERY'
  | 'FAVORITISM'
  | 'ABUSE_OF_POWER'
  | 'PROCUREMENT'
  | 'OTHER';

export interface AlertEntry {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  shortDescription: string;
  location: string;
  /** ISO-8601. */
  receivedAt: string;
}

function buildInitialAlerts(): AlertEntry[] {
  const rand = rng(66);
  const samples: Array<Pick<AlertEntry, 'severity' | 'category' | 'shortDescription' | 'location'>> = [
    { severity: 'CRITICAL', category: 'FORGERY', shortDescription: 'Tentative usurpation NINA — falsification photo', location: 'CTDEC Bamako' },
    { severity: 'HIGH', category: 'BRIBERY', shortDescription: 'Pot-de-vin allégué — file P1 RDV', location: 'CTDEC Sikasso' },
    { severity: 'MEDIUM', category: 'FAVORITISM', shortDescription: 'Traitement prioritaire signalé sans motif', location: 'Mairie Comm. IV' },
    { severity: 'HIGH', category: 'FORGERY', shortDescription: 'Document antériorité douteux', location: 'DNEC' },
    { severity: 'CRITICAL', category: 'ABUSE_OF_POWER', shortDescription: 'Pression sur agent — chaîne hiérarchique', location: 'Gouvernorat Mopti' },
    { severity: 'MEDIUM', category: 'PROCUREMENT', shortDescription: 'Fournisseur unique signalé sur 3 marchés', location: 'CTDEC Bamako' },
    { severity: 'LOW', category: 'OTHER', shortDescription: 'Plainte sur délai de traitement >30j', location: 'CTDEC Ségou' },
    { severity: 'MEDIUM', category: 'BRIBERY', shortDescription: 'Demande paiement « frais accélération »', location: 'RAVEC Kayes' },
  ];

  return samples.map((s, i) => ({
    id: `alert-${String(i + 1).padStart(4, '0')}`,
    ...s,
    receivedAt: new Date(Date.now() - (5 + rand() * 24) * 60 * 60 * 1000).toISOString(),
  }));
}

export const INITIAL_ALERTS: readonly AlertEntry[] = buildInitialAlerts();

/** Génère une nouvelle alerte aléatoire pour simuler un flux SSE temps réel. */
export function generateNewAlert(prevCount: number): AlertEntry {
  const rand = rng(prevCount * 1009 + 7);
  const cats: AlertCategory[] = ['BRIBERY', 'FORGERY', 'FAVORITISM', 'ABUSE_OF_POWER', 'PROCUREMENT', 'OTHER'];
  const sevs: AlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const locs = ['CTDEC Bamako', 'CTDEC Sikasso', 'RAVEC Kayes', 'RAVEC Mopti', 'DNEC', 'Mairie Comm. IV'];
  const descriptions = [
    'Signalement anonyme reçu — investigation requise',
    'Doublon de demande détecté',
    'Témoignage corroborant déjà classé',
    'Variation suspecte sur volume traité',
    'Alerte automatique du module IA v3.2',
  ];

  return {
    id: `alert-${String(prevCount + 1).padStart(4, '0')}`,
    severity: sevs[Math.floor(rand() * sevs.length)]!,
    category: cats[Math.floor(rand() * cats.length)]!,
    shortDescription: descriptions[Math.floor(rand() * descriptions.length)]!,
    location: locs[Math.floor(rand() * locs.length)]!,
    receivedAt: new Date().toISOString(),
  };
}
