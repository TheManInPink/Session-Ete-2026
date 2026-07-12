/**
 * @file        agent-detail.ts
 * @description View-model DÉTERMINISTE du dossier d'intégrité d'un agent
 *              (AD-03 → détail SIGAC, cible du lien « Investiguer »).
 *
 *              Le contrat `AdminDashboardStats.topAgents` ne porte que 5 champs
 *              par agent (`{ id, name, score, centerCode, matricule }`). Cette
 *              couche en DÉRIVE, de façon 100 % déterministe (graine = id agent,
 *              famille Mulberry32 comme les fixtures api-client), une vue
 *              d'investigation : sous-scores pondérés (ADR-023), historique 30 j,
 *              opérations récentes et signaux ouverts.
 *
 *              CONTRAT HONNÊTE : ces éléments sont une PROJECTION DÉMO du score
 *              agrégé — ils n'existent pas encore comme source backend (Bloc D).
 *              La page les signale explicitement comme illustratifs et n'affiche
 *              RIEN de dérivé en mode live (`topAgents = null` → indisponible).
 *              Aucun `Math.random` / `Date.now` : stabilité des e2e.
 *
 * @module      @nina-aes/admin
 */

import type { AgentIntegrity } from '@nina-aes/api-client';

/** Bandes sémantiques alignées sur `IntegrityGauge` (≥80 / 50-79 / <50). */
export type IntegrityBand = 'good' | 'watch' | 'critical';

/** Un des 5 critères pondérés qui composent le score d'intégrité (ADR-023). */
export interface AgentCriterion {
  key: string;
  /** Libellé métier (FR — surface admin mono-langue, cf. sigac-client). */
  label: string;
  /** Aide contextuelle : ce que mesure le critère. */
  hint: string;
  /** Score du critère, 0-100. */
  score: number;
  /** Poids relatif dans le score global, en pourcentage entier (somme = 100). */
  weight: number;
}

/** Une opération récente de l'agent (ligne du journal 30 j). */
export interface AgentOperation {
  id: string;
  /** Ancienneté relative, ex. `J-3` (déterministe, sans date absolue). */
  dayLabel: string;
  type: string;
  detail: string;
  /** `flagged` = ligne qui pèse négativement sur le score. */
  status: 'ok' | 'flagged';
}

/** Dossier d'intégrité complet dérivé pour la page détail agent. */
export interface AgentIntegrityDetail {
  agent: AgentIntegrity;
  band: IntegrityBand;
  criteria: AgentCriterion[];
  /** 30 points bornés 0-100, dernier point = score courant. */
  history: number[];
  operations: AgentOperation[];
  /** Signalements anonymes ouverts visant l'agent (0 si score ≥ 70). */
  openSignals: number;
  /** Opérations traitées sur 30 j. */
  processed30d: number;
  /** Part des opérations signalées, en pourcentage entier. */
  flaggedRate: number;
  /** Ancienneté relative de la dernière revue superviseur, ex. `J-6`. */
  lastReviewDayLabel: string;
}

/** Mulberry32 — même famille de PRNG que les fixtures api-client (reproductible). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash déterministe d'une chaîne (FNV-1a 32 bits) → graine PRNG stable par id. */
function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

export function bandFor(score: number): IntegrityBand {
  if (score >= 80) return 'good';
  if (score >= 50) return 'watch';
  return 'critical';
}

/** Définition statique des 5 critères (poids sommant à 100). */
const CRITERIA_DEFS: ReadonlyArray<Pick<AgentCriterion, 'key' | 'label' | 'hint' | 'weight'>> = [
  {
    key: 'compliance',
    label: 'Conformité des corrections',
    hint: 'Corrections validées sans rejet ni reprise ultérieure.',
    weight: 30,
  },
  {
    key: 'timeliness',
    label: 'Respect des délais',
    hint: 'Traitement dans les SLA (RDV honorés, corrections sous délai).',
    weight: 20,
  },
  {
    key: 'biometric',
    label: 'Cohérence biométrique',
    hint: 'Dédoublonnage AFIS sans collision forcée ni contournement.',
    weight: 20,
  },
  {
    key: 'signals',
    label: 'Absence de signalements',
    hint: 'Signalements anonymes reçus via SIGAC (pondéré inversement).',
    weight: 15,
  },
  {
    key: 'oversight',
    label: 'Revue par les pairs',
    hint: 'Contrôles superviseur et revues croisées conformes.',
    weight: 15,
  },
];

const OPERATION_POOL: ReadonlyArray<{ type: string; detail: string }> = [
  { type: 'Correction', detail: 'Validation correction état civil (nom / date).' },
  { type: 'Enrôlement', detail: 'Capture biométrique — dédoublonnage AFIS.' },
  { type: 'Rendez-vous', detail: 'Rendez-vous RAVEC honoré au guichet.' },
  { type: 'Correction', detail: 'Rejet dossier — pièce justificative manquante.' },
  { type: 'Signalement', detail: 'Signalement anonyme reçu — file SIGAC.' },
  { type: 'Habilitation', detail: 'Renouvellement d’habilitation — revue superviseur.' },
  { type: 'Correction', detail: 'Correction filiation — antériorité vérifiée.' },
  { type: 'Enrôlement', detail: 'Reprise capture — qualité empreinte insuffisante.' },
];

/**
 * Construit le dossier d'intégrité déterministe d'un agent à partir de son
 * enregistrement `AgentIntegrity` (source de vérité = `agent.score`).
 *
 * Les sous-scores sont générés autour du score global puis recentrés pour que
 * leur moyenne pondérée reste proche du score agrégé (décomposition crédible).
 */
export function buildAgentDetail(agent: AgentIntegrity): AgentIntegrityDetail {
  const base = clamp(agent.score);
  const rand = mulberry32(seedFromId(agent.id));

  // ── Sous-scores : offsets déterministes puis recentrage sur `base` ─────────
  const spread = 15;
  const raw = CRITERIA_DEFS.map((def) => {
    const offset = (rand() - 0.5) * 2 * spread;
    // Le critère « signalements » sur-réagit quand le score global est bas.
    const skew = def.key === 'signals' ? (base < 60 ? -8 : 4) : 0;
    return base + offset + skew;
  });
  const totalWeight = CRITERIA_DEFS.reduce((s, d) => s + d.weight, 0);
  const weightedMean = raw.reduce((s, v, i) => s + v * CRITERIA_DEFS[i]!.weight, 0) / totalWeight;
  const recenter = base - weightedMean;
  const criteria: AgentCriterion[] = CRITERIA_DEFS.map((def, i) => ({
    ...def,
    score: clamp(raw[i]! + recenter),
  }));

  // ── Historique 30 j : dérive d'un point de départ vers le score courant ────
  const histRand = mulberry32(seedFromId(agent.id) ^ 0x9e3779b9);
  const start = clamp(base + (histRand() - 0.5) * 24 - (base < 60 ? 10 : 0));
  const history = Array.from({ length: 30 }, (_, i) => {
    const trend = start + ((base - start) * i) / 29;
    const noise = (histRand() - 0.5) * 8;
    return clamp(trend + noise);
  });
  history[29] = base; // le dernier point reflète exactement le score affiché

  // ── Indicateurs synthétiques ───────────────────────────────────────────────
  const flaggedRate = Math.max(0, Math.min(45, Math.round((100 - base) * 0.45)));
  const processed30d = 220 + Math.round(rand() * 380);
  const openSignals = base < 70 ? Math.ceil((70 - base) / 12) : 0;
  const lastReviewDayLabel = `J-${2 + Math.floor(rand() * 12)}`;

  // ── Opérations récentes (6) — flags cohérents avec `flaggedRate` ───────────
  const opsCount = 6;
  const operations: AgentOperation[] = Array.from({ length: opsCount }, (_, i) => {
    const pick = OPERATION_POOL[Math.floor(rand() * OPERATION_POOL.length)]!;
    const forcedFlag = pick.type === 'Signalement';
    const flagged = forcedFlag || rand() < flaggedRate / 100;
    return {
      id: `${agent.id}-op-${i + 1}`,
      dayLabel: `J-${i * 3 + 1 + Math.floor(rand() * 2)}`,
      type: pick.type,
      detail: pick.detail,
      status: flagged ? 'flagged' : 'ok',
    };
  });

  return {
    agent,
    band: bandFor(base),
    criteria,
    history,
    operations,
    openSignals,
    processed30d,
    flaggedRate,
    lastReviewDayLabel,
  };
}
