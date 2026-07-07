/**
 * @file        institutions.ts
 * @description View-model DÉTERMINISTE de la performance institutionnelle
 *              (GOV — Performance : « traçabilité et réactivité par institution »).
 *
 *              Aucun contrat performance n'existe côté `governance-service`
 *              (doc 22 à venir) : cette couche fournit un jeu de démonstration
 *              reproductible (graine = id institution, famille Mulberry32) pour
 *              matérialiser l'écran. HONNÊTETÉ : en mode live la page rend un
 *              état « indisponible » ; ce builder n'alimente QUE le mode mock.
 *              Aucun `Date.now` / `Math.random` : e2e stable.
 *
 * @module      @nina-aes/governance
 */

/** Métriques agrégées d'une institution sur la période. */
export interface InstitutionPerformance {
  id: string;
  name: string;
  shortName: string;
  /** Directives reçues sur la période. */
  directives: number;
  /** Taux d'exécution (directives terminées), en pourcentage entier. */
  completionRate: number;
  /** Délai moyen de première réponse, en jours (1 décimale). */
  avgResponseDays: number;
  /** Directives en retard (échéance dépassée). */
  overdue: number;
  /** Escalades hiérarchiques déclenchées. */
  escalations: number;
  /** Score de traçabilité 0-100 (signature + horodatage + suivi). */
  traceabilityScore: number;
  /** Tendance du score sur 12 périodes (dernier point = score courant). */
  trend: number[];
}

export interface PerformanceTotals {
  institutions: number;
  avgCompletion: number;
  avgResponseDays: number;
  overdue: number;
}

export interface PerformanceOverview {
  /** Institutions triées par traçabilité décroissante (classement). */
  institutions: InstitutionPerformance[];
  totals: PerformanceTotals;
  leastTraceable: InstitutionPerformance | null;
  mostTraceable: InstitutionPerformance | null;
}

/** Bandes sémantiques de traçabilité (≥80 / 50-79 / <50). */
export type TraceBand = 'good' | 'watch' | 'critical';

export function traceBandFor(score: number): TraceBand {
  if (score >= 80) return 'good';
  if (score >= 50) return 'watch';
  return 'critical';
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

/** Hash déterministe d'une chaîne (FNV-1a 32 bits) → graine PRNG. */
function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

/** Institutions suivies par le portail gouvernance (contexte Mali / AES). */
const INSTITUTIONS: ReadonlyArray<Pick<InstitutionPerformance, 'id' | 'name' | 'shortName'>> = [
  { id: 'minint', name: "Ministère de l'Intérieur", shortName: 'MININT' },
  { id: 'minjus', name: 'Ministère de la Justice', shortName: 'MINJUS' },
  { id: 'matd', name: "Ministère de l'Administration Territoriale", shortName: 'MATD' },
  { id: 'mindef', name: 'Ministère de la Défense', shortName: 'MINDEF' },
  { id: 'dnec', name: "Direction Nationale de l'État Civil", shortName: 'DNEC' },
  { id: 'gouv-bamako', name: 'Gouvernorat de Bamako', shortName: 'Bamako' },
  { id: 'gouv-sikasso', name: 'Gouvernorat de Sikasso', shortName: 'Sikasso' },
  { id: 'gouv-mopti', name: 'Gouvernorat de Mopti', shortName: 'Mopti' },
];

/**
 * Construit l'aperçu de performance déterministe (mode mock). Chaque institution
 * est graine par son id ; les métriques dérivent du score de traçabilité pour
 * rester cohérentes entre elles (une faible traçabilité ⇒ plus de retards).
 */
export function buildMockPerformance(): PerformanceOverview {
  const list: InstitutionPerformance[] = INSTITUTIONS.map((inst) => {
    const rand = mulberry32(seedFromId(inst.id));
    const traceabilityScore = clamp(45 + rand() * 50);
    const completionRate = clamp(traceabilityScore + (rand() - 0.5) * 20);
    const avgResponseDays = Math.round((1 + rand() * 6) * 10) / 10;
    const directives = 8 + Math.floor(rand() * 40);
    const overdue = Math.min(
      directives,
      Math.round(((100 - traceabilityScore) / 12) * (0.6 + rand() * 0.6)),
    );
    const escalations = Math.round(overdue * (0.3 + rand() * 0.5));

    const trendStart = clamp(traceabilityScore + (rand() - 0.5) * 24);
    const trend = Array.from({ length: 12 }, (_, i) => {
      const drift = trendStart + ((traceabilityScore - trendStart) * i) / 11;
      return clamp(drift + (rand() - 0.5) * 6);
    });
    trend[11] = traceabilityScore;

    return {
      ...inst,
      directives,
      completionRate,
      avgResponseDays,
      overdue,
      escalations,
      traceabilityScore,
      trend,
    };
  });

  const n = list.length || 1;
  const totals: PerformanceTotals = {
    institutions: list.length,
    avgCompletion: Math.round(list.reduce((s, i) => s + i.completionRate, 0) / n),
    avgResponseDays: Math.round((list.reduce((s, i) => s + i.avgResponseDays, 0) / n) * 10) / 10,
    overdue: list.reduce((s, i) => s + i.overdue, 0),
  };

  const byTraceAsc = [...list].sort((a, b) => a.traceabilityScore - b.traceabilityScore);
  const leastTraceable = byTraceAsc[0] ?? null;
  const mostTraceable = byTraceAsc[byTraceAsc.length - 1] ?? null;
  const institutions = [...list].sort((a, b) => b.traceabilityScore - a.traceabilityScore);

  return { institutions, totals, leastTraceable, mostTraceable };
}
