/**
 * @file        monthly.ts
 * @description View-model DÉTERMINISTE des synthèses mensuelles de gouvernance
 *              (GOV — Rapports). Chaque rapport agrège l'exécution du mois ; le
 *              rapport vedette met en avant les « institutions les moins
 *              traçables » (réutilise le classement de `lib/performance`).
 *
 *              Aucun contrat de rapports côté `governance-service` (doc 22) :
 *              jeu de démonstration reproductible. HONNÊTETÉ : en mode live la
 *              page rend un état « indisponible » ; ce builder n'alimente QUE le
 *              mode mock. Les périodes sont des libellés fixes (pas de `Date.now`),
 *              e2e stable.
 *
 * @module      @nina-aes/governance
 */

import { buildMockPerformance, type InstitutionPerformance } from '../performance/institutions';

export type ReportStatus = 'PUBLISHED' | 'DRAFT';

/** Synthèse mensuelle d'exécution. */
export interface MonthlyReport {
  id: string;
  periodLabel: string;
  status: ReportStatus;
  directivesProcessed: number;
  /** Taux d'exécution du mois, en pourcentage entier. */
  completionRate: number;
  /** Institutions sous le seuil de traçabilité (à auditer). */
  institutionsInAlert: number;
  /** Délai moyen de réponse, en jours (1 décimale). */
  avgResponseDays: number;
  /** Nombre de pages du PDF généré. */
  pages: number;
}

export interface ReportsOverview {
  reports: MonthlyReport[];
  /** Dernier rapport PUBLIÉ (vedette), ou `null`. */
  featured: MonthlyReport | null;
  /** 3 institutions les moins traçables du classement courant. */
  leastTraceable: InstitutionPerformance[];
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

// Périodes fixes : le mois courant (Juillet 2026) est encore EN COURS ; les
// mois révolus sont PUBLIÉS. Libellés statiques → déterministe.
const MONTHS: ReadonlyArray<{ id: string; label: string; status: ReportStatus }> = [
  { id: '2026-07', label: 'Juillet 2026', status: 'DRAFT' },
  { id: '2026-06', label: 'Juin 2026', status: 'PUBLISHED' },
  { id: '2026-05', label: 'Mai 2026', status: 'PUBLISHED' },
  { id: '2026-04', label: 'Avril 2026', status: 'PUBLISHED' },
  { id: '2026-03', label: 'Mars 2026', status: 'PUBLISHED' },
  { id: '2026-02', label: 'Février 2026', status: 'PUBLISHED' },
  { id: '2026-01', label: 'Janvier 2026', status: 'PUBLISHED' },
];

/** Construit l'aperçu des rapports mensuels déterministe (mode mock). */
export function buildMockReports(): ReportsOverview {
  const reports: MonthlyReport[] = MONTHS.map((m) => {
    const rand = mulberry32(seedFromId(m.id));
    return {
      id: m.id,
      periodLabel: m.label,
      status: m.status,
      directivesProcessed: 180 + Math.floor(rand() * 320),
      completionRate: clamp(62 + rand() * 30),
      institutionsInAlert: 1 + Math.floor(rand() * 4),
      avgResponseDays: Math.round((1.5 + rand() * 5) * 10) / 10,
      pages: 8 + Math.floor(rand() * 16),
    };
  });

  const featured = reports.find((r) => r.status === 'PUBLISHED') ?? null;
  const leastTraceable = [...buildMockPerformance().institutions]
    .sort((a, b) => a.traceabilityScore - b.traceabilityScore)
    .slice(0, 3);

  return { reports, featured, leastTraceable };
}
