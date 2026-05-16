/**
 * @file        mock-corrections.ts
 * @description 50+ corrections fictives pour AD-02 tant que correction-service
 *              (port 3005) n'est pas câblé. Les valeurs sont déterministes
 *              (seed fixe sur l'index) pour faciliter les screenshots / tests.
 *
 *              Distribution :
 *                - 9 champs `field` représentés équitablement
 *                - 4 statuts : UNDER_REVIEW (60 %), APPROVED (20 %), REJECTED
 *                  (15 %), AWAITING_DOCUMENT (5 %)
 *                - 4 régions Mali : Bamako, Sikasso, Kayes, Mopti
 *                - Score IA : 30–98 ; verdict HIGH ≥ 80, MEDIUM 50-79, LOW < 50
 *                - 3 sous-scores IA : fuzzyMatch, consistency, agentHistory
 *
 *              À supprimer en Session 4+ quand `api.correction.list({ ... })`
 *              (côté agent) sera implémenté côté backend.
 *
 * @module      @nina-aes/admin
 */

import type { CorrectionField, CorrectionStatus } from '@nina-aes/api-client';

/**
 * Statut côté agent — étend `CorrectionStatus` partagé avec un état
 * spécifique au workflow admin : `AWAITING_DOCUMENT` (le citoyen doit
 * encore fournir un justificatif). En production ce statut sera un alias
 * de `UNDER_REVIEW` + un flag `documentRequired`.
 */
export type AdminCorrectionStatus = CorrectionStatus | 'AWAITING_DOCUMENT';

/** Sous-scores IA, affichés dans le drawer de AD-02. */
export interface AiSubScores {
  /** Distance Levenshtein normalisée entre avant/après (0-100). */
  fuzzyMatch: number;
  /** Cohérence avec les autres champs du citoyen (0-100). */
  consistency: number;
  /** Score historique de fiabilité de l'agent CTDEC source (0-100). */
  agentHistory: number;
}

/** Événement timeline pour la fiche correction (drawer AD-02). */
export interface CorrectionTimelineEvent {
  /** ISO-8601. */
  at: string;
  /** Type d'événement métier. */
  kind:
    | 'SUBMITTED'
    | 'AI_SCORED'
    | 'AGENT_REVIEW'
    | 'DOCUMENT_REQUESTED'
    | 'DOCUMENT_UPLOADED'
    | 'APPROVED'
    | 'REJECTED';
  /** Acteur (nom affichable ou null pour les événements système). */
  actor: string | null;
  /** Note libre. */
  note?: string;
}

/** Modèle agent — étend la `CorrectionRequest` partagée. */
export interface AdminCorrection {
  id: string;
  nina: string;
  citizenName: string;
  field: CorrectionField;
  currentValue: string;
  proposedValue: string;
  reason: string;
  aiScore: number;
  aiVerdict: 'HIGH' | 'MEDIUM' | 'LOW';
  aiSubScores: AiSubScores;
  status: AdminCorrectionStatus;
  region: 'Bamako' | 'Sikasso' | 'Kayes' | 'Mopti';
  hasJustificatif: boolean;
  submittedAt: string;
  timeline: CorrectionTimelineEvent[];
}

// ── Générateur déterministe ─────────────────────────────────────────────────

const FIRST_NAMES = [
  'Fatoumata', 'Modibo', 'Aminata', 'Oumar', 'Mariam', 'Ibrahim', 'Aïcha',
  'Souleymane', 'Kadiatou', 'Cheickna', 'Hawa', 'Issa', 'Bintou', 'Mamadou',
  'Coumba', 'Boubacar', 'Salimata', 'Lassine', 'Awa', 'Sékou',
];
const LAST_NAMES = [
  'Diallo', 'Touré', 'Coulibaly', 'Traoré', 'Keïta', 'Diarra', 'Cissé',
  'Sangaré', 'Konaté', 'Sissoko', 'Camara', 'Doumbia', 'Maïga', 'Diakité',
  'Sidibé', 'Tangara', 'Fofana', 'Sylla', 'Bagayoko', 'Dembélé',
];

const FIELDS: CorrectionField[] = [
  'firstName', 'lastName', 'birthDate', 'birthPlace',
  'residence_cercle', 'residence_commune', 'fatherName', 'motherName', 'profession',
];

const FIELD_SAMPLE_CHANGES: Record<CorrectionField, Array<[string, string]>> = {
  firstName: [['Fatumata', 'Fatoumata'], ['Aminat', 'Aminata'], ['Modibu', 'Modibo']],
  lastName: [['Toure', 'Touré'], ['Coulibaly', 'Coulibaly'], ['Keita', 'Keïta']],
  birthDate: [['1995-13-02', '1995-12-02'], ['1988-06-31', '1988-06-30']],
  birthPlace: [['Bla', 'Blá'], ['Sikaso', 'Sikasso'], ['Mopti', 'Sévaré']],
  residence_cercle: [['Sikaso', 'Sikasso'], ['Kati', 'Kati'], ['Yorosso', 'Yorosso']],
  residence_commune: [['Bla', 'Blá'], ['Commune V', 'Commune IV'], ['Sevare', 'Sévaré']],
  fatherName: [['Oumar TOURE', 'Oumar Touré'], ['Modibo KEITA', 'Modibo Keïta']],
  motherName: [['Aminata DIARRA', 'Aminata Diarra'], ['Mariam SISOKO', 'Mariam Sissoko']],
  profession: [['Cultivateur', 'Agriculteur'], ['Commerçante', 'Commerçante détaillante']],
};

const REGIONS: AdminCorrection['region'][] = ['Bamako', 'Sikasso', 'Kayes', 'Mopti'];

/** PRNG déterministe : Mulberry32. Pas crypto, juste reproductible. */
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

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

/** Génère un NINA valide (14 chiffres + 1 lettre de contrôle dérivée). */
function generateNina(rand: () => number): string {
  const digits = Array.from({ length: 14 }, () => Math.floor(rand() * 10)).join('');
  const sum = digits.split('').reduce((acc, d) => acc + Number(d), 0);
  const letter = String.fromCharCode(65 + (sum % 26));
  return `${digits}${letter}`;
}

function pickStatus(rand: () => number): AdminCorrectionStatus {
  const r = rand();
  if (r < 0.6) return 'UNDER_REVIEW';
  if (r < 0.8) return 'APPROVED';
  if (r < 0.95) return 'REJECTED';
  return 'AWAITING_DOCUMENT';
}

function pickVerdict(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 80) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

function buildTimeline(
  rand: () => number,
  submittedAt: Date,
  status: AdminCorrectionStatus,
  citizenName: string,
): CorrectionTimelineEvent[] {
  const events: CorrectionTimelineEvent[] = [
    { at: submittedAt.toISOString(), kind: 'SUBMITTED', actor: citizenName },
  ];
  // +30s : score IA
  const aiAt = new Date(submittedAt.getTime() + 30_000);
  events.push({ at: aiAt.toISOString(), kind: 'AI_SCORED', actor: null, note: 'Module IA v3.2' });

  if (status === 'AWAITING_DOCUMENT') {
    const askAt = new Date(submittedAt.getTime() + 2 * 3600_000);
    events.push({
      at: askAt.toISOString(),
      kind: 'DOCUMENT_REQUESTED',
      actor: 'Modibo Konaté',
      note: 'Acte de naissance demandé',
    });
  } else if (status === 'APPROVED' || status === 'REJECTED') {
    const reviewAt = new Date(submittedAt.getTime() + (3 + rand() * 20) * 3600_000);
    events.push({
      at: reviewAt.toISOString(),
      kind: 'AGENT_REVIEW',
      actor: 'Modibo Konaté',
    });
    events.push({
      at: new Date(reviewAt.getTime() + 60_000).toISOString(),
      kind: status,
      actor: 'Modibo Konaté',
      note: status === 'REJECTED' ? 'Justificatif insuffisant' : undefined,
    });
  }

  return events;
}

export function generateMockCorrections(count = 50): AdminCorrection[] {
  const rand = rng(42);
  const items: AdminCorrection[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = pick(rand, FIRST_NAMES);
    const lastName = pick(rand, LAST_NAMES);
    const field = pick(rand, FIELDS);
    const [before, after] = pick(rand, FIELD_SAMPLE_CHANGES[field]);
    const score = 30 + Math.floor(rand() * 69); // 30-98
    const status = pickStatus(rand);
    const region = pick(rand, REGIONS);

    // Soumission entre 1h et 30 jours en arrière
    const ageHours = 1 + rand() * 24 * 30;
    const submittedAt = new Date(Date.now() - ageHours * 3600_000);

    const citizenName = `${firstName} ${lastName}`;

    items.push({
      id: `cor-${String(i + 1).padStart(6, '0')}`,
      nina: generateNina(rand),
      citizenName,
      field,
      currentValue: before,
      proposedValue: after,
      reason: pick(rand, [
        `Faute de frappe sur mon acte de naissance — la bonne orthographe est « ${after} ».`,
        `Erreur de saisie au centre d'enregistrement. Le justificatif joint le confirme.`,
        `Mon document officiel indique « ${after} », pas « ${before} ».`,
        `Différence due à une translittération approximative ; valeur correcte : « ${after} ».`,
      ]),
      aiScore: score,
      aiVerdict: pickVerdict(score),
      aiSubScores: {
        fuzzyMatch: Math.max(0, Math.min(100, score + Math.floor((rand() - 0.5) * 10))),
        consistency: Math.max(0, Math.min(100, score + Math.floor((rand() - 0.5) * 20))),
        agentHistory: Math.max(40, Math.min(100, score + Math.floor((rand() - 0.5) * 15))),
      },
      status,
      region,
      hasJustificatif: rand() > 0.4,
      submittedAt: submittedAt.toISOString(),
      timeline: buildTimeline(rand, submittedAt, status, citizenName),
    });
  }

  return items;
}

/** Cache module-level : on régénère à l'import puis on partage. */
export const MOCK_CORRECTIONS: AdminCorrection[] = generateMockCorrections(50);
