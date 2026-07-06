/**
 * @file        view-model.ts
 * @description Adaptateur AD-01 / AD-03 : `AdminDashboardStats` (contrat
 *              @nina-aes/api-client) → modèles de vue de la console agent.
 *
 *              Le contrat ne transporte que des DONNÉES ; les concerns de vue
 *              (tonalité de sparkline, cible de drill-down, libellés d'axes)
 *              sont réintroduits ici. Chaque section du contrat est nullable
 *              (`null` = agrégation Bloc D absente) : les pages rendent alors
 *              un état « indisponible » explicite, jamais un zéro menteur.
 *
 * @module      @nina-aes/admin
 */

import type {
  AdminKpiKey,
  AdminKpiSnapshot,
  AlertCategory,
  AlertEntry,
  AlertSeverity,
  DailyCorrectionCount,
  RegionActivity,
} from '@nina-aes/api-client';

// ── KPI cards (AD-01) ─────────────────────────────────────────────────────────

/** Modèle de vue d'une carte KPI : données du contrat + concerns d'affichage. */
export interface KpiSnapshotView extends AdminKpiSnapshot {
  /** Tonalité de la sparkline. */
  tone: 'primary' | 'success' | 'warning' | 'danger';
  /** Segment de drill-down relatif à la locale (`corrections`, …) ou null. */
  drillTo: string | null;
}

/** Concerns de vue par indicateur (l'ordre d'affichage suit le contrat). */
const KPI_VIEW_CONCERNS: Record<AdminKpiKey, Pick<KpiSnapshotView, 'tone' | 'drillTo'>> = {
  ninaActive: { tone: 'primary', drillTo: null },
  correctionsPending: { tone: 'warning', drillTo: 'corrections' },
  alertsOpen: { tone: 'danger', drillTo: 'sigac' },
  appointmentsToday: { tone: 'success', drillTo: 'appointments' },
};

/** Habille les instantanés KPI du contrat avec leurs concerns de vue. */
export function toKpiViews(kpis: readonly AdminKpiSnapshot[]): KpiSnapshotView[] {
  return kpis.map((k) => ({ ...k, ...KPI_VIEW_CONCERNS[k.key] }));
}

// ── AreaChart corrections / jour (AD-01) ──────────────────────────────────────

/** Convertit la série `YYYY-MM-DD` du contrat en points `{ x: 'JJ/MM', y }`. */
export function toAreaChartData(
  perDay: readonly DailyCorrectionCount[],
): Array<{ x: string; y: number }> {
  return perDay.map((p) => ({ x: `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`, y: p.count }));
}

// ── MaliHeatmap (AD-01 + AD-03) ───────────────────────────────────────────────

/**
 * Convertit l'activité régionale du contrat en data heatmap. Le libellé
 * accessible par défaut (`Région : valeur`) est fourni par la MaliHeatmap
 * elle-même à partir du GeoJSON — inutile de dupliquer un annuaire de noms.
 */
export function toHeatmapData(
  regions: readonly RegionActivity[],
): Array<{ regionCode: string; value: number }> {
  return regions.map((r) => ({ regionCode: r.regionCode, value: r.value }));
}

// ── Feed d'alertes (AD-01) — simulation mock uniquement ──────────────────────

/** PRNG déterministe Mulberry32 (même algo que les fixtures du api-client). */
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

/**
 * Génère une nouvelle alerte pour simuler un flux SSE temps réel.
 *
 * ⚠️ Réservé au mode `mock` (démo sans backend) : le composant AlertsFeed ne
 * l'appelle que si `useApiMode() === 'mock'`. En live, le feed n'affiche que
 * les alertes du contrat (flux SSE réel à venir — Bloc D).
 */
export function generateNewAlert(prevCount: number): AlertEntry {
  const rand = rng(prevCount * 1009 + 7);
  const cats: AlertCategory[] = [
    'BRIBERY',
    'FORGERY',
    'FAVORITISM',
    'ABUSE_OF_POWER',
    'PROCUREMENT',
    'OTHER',
  ];
  const sevs: AlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const locs = [
    'CTDEC Bamako',
    'CTDEC Sikasso',
    'RAVEC Kayes',
    'RAVEC Mopti',
    'DNEC',
    'Mairie Comm. IV',
  ];
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
