/**
 * @file        corrections.fixtures.ts
 * @description Fixtures déterministes du domaine corrections.
 *
 *              Vue AGENT (AD-02) : 50 demandes reproductibles couvrant des
 *              NINAs **valides** (lettre de contrôle correcte) aux régions
 *              variées (chiffre région du NINA → heatmap/dérivation région
 *              côté app admin), des statuts répartis (majorité UNDER_REVIEW,
 *              des APPROVED/REJETÉES) et des scores IA variés.
 *
 *              COMPATIBILITÉ CITIZEN : les 2 premières entrées sont les
 *              fixtures citoyennes historiques (NINA `18903102015042V`) avec
 *              les MÊMES valeurs — `list({ nina })` du mock filtre ce magasin
 *              et renvoie donc exactement ce que voyaient les e2e PC-05.
 *
 * @module      @nina-aes/api-client
 */

import { generateDemoCitizen } from '../identity/demo-citizen';
import {
  CorrectionRequestSchema,
  type CorrectionField,
  type CorrectionRequest,
  type CorrectionStatus,
} from '../correction/correction.schema';
import { buildNina, seedOf, uuidFrom, FIXED_NOW } from './deterministic';
import { DEFAULT_MOCK_NINA, MOCK_ADMIN_REVIEWER_ID, MOCK_SECOND_REVIEWER_ID } from './personas';

/** Construit une demande de correction valide (statut paramétrable). */
export function buildCorrection(
  nina: string,
  overrides: Partial<CorrectionRequest> & Pick<CorrectionRequest, 'field' | 'proposedValue'>,
): CorrectionRequest {
  const demo = generateDemoCitizen(nina);
  const seedText = `${nina}-${overrides.field}-${overrides.proposedValue}`;
  const candidate: CorrectionRequest = {
    id: overrides.id ?? uuidFrom(`corr-${seedText}`),
    citizenId: uuidFrom(`citizen-${nina}`),
    nina,
    field: overrides.field,
    currentValue: overrides.currentValue ?? '—',
    proposedValue: overrides.proposedValue,
    reason: overrides.reason ?? 'Justification fournie par le citoyen.',
    justificationDocUrl: overrides.justificationDocUrl ?? null,
    aiScore: overrides.aiScore ?? null,
    aiVerdict: overrides.aiVerdict ?? null,
    status: overrides.status ?? 'UNDER_REVIEW',
    reviewedBy: overrides.reviewedBy ?? null,
    decidedAt: overrides.decidedAt ?? null,
    decisionReason: overrides.decisionReason ?? null,
    createdAt: overrides.createdAt ?? FIXED_NOW,
    updatedAt: overrides.updatedAt ?? FIXED_NOW,
    // Join citoyen léger (comme le renvoie GET /corrections côté agent).
    citizen: overrides.citizen ?? {
      id: uuidFrom(`citizen-${nina}`),
      nina,
      firstName: demo.firstName,
      lastName: demo.lastName,
    },
  };
  // Fail-closed : même en mock on valide la forme renvoyée.
  return CorrectionRequestSchema.parse(candidate);
}

/** Paires plausibles valeur actuelle → valeur proposée, par champ. */
const FIELD_SAMPLES: Record<
  CorrectionField,
  ReadonlyArray<{ current: string; proposed: string }>
> = {
  firstName: [
    { current: 'Mamadu', proposed: 'Mamadou' },
    { current: 'Fatumata', proposed: 'Fatoumata' },
  ],
  lastName: [
    { current: 'Kone', proposed: 'Koné' },
    { current: 'Traore', proposed: 'Traoré' },
  ],
  birthDate: [
    { current: '1989-03-15', proposed: '1989-03-10' },
    { current: '1972-11-02', proposed: '1972-01-02' },
  ],
  birthPlace: [
    { current: 'Bamako', proposed: 'Sikasso' },
    { current: 'Ségou', proposed: 'Mopti' },
  ],
  residence_cercle: [
    { current: 'Kati', proposed: 'Koulikoro' },
    { current: 'Bougouni', proposed: 'Yanfolila' },
  ],
  residence_commune: [
    { current: 'Commune III', proposed: 'Commune IV' },
    { current: 'Sangarébougou', proposed: 'Moribabougou' },
  ],
  fatherName: [
    { current: 'Sekou Diarra', proposed: 'Sékou Diarra' },
    { current: 'Usman Cissé', proposed: 'Ousmane Cissé' },
  ],
  motherName: [
    { current: 'Awa Sangare', proposed: 'Awa Sangaré' },
    { current: 'Mariam Toure', proposed: 'Mariam Touré' },
  ],
  profession: [
    { current: 'Cultivateur', proposed: 'Agriculteur' },
    { current: 'Commercant', proposed: 'Commerçant' },
  ],
};

/** Motifs de rejet plausibles (≥ 20 caractères, contrainte backend). */
const REJECT_REASONS = [
  'Justificatif illisible — demander un scan de meilleure qualité.',
  'Incohérence avec le registre RAVEC source — vérification terrain requise.',
] as const;

/** Motifs de demande côté citoyen. */
const REQUEST_REASONS = [
  'Erreur de translittération constatée lors du retrait de la carte NINA.',
  'Correction demandée suite à la mise à jour du registre d’état civil.',
  'Divergence entre l’acte de naissance et la fiche RAVEC numérisée.',
] as const;

/**
 * Chiffres région (position 5 du NINA) cyclés pour que l'app admin puisse
 * dériver une répartition régionale plausible (Bamako « 9 » surreprésenté).
 */
const REGION_CYCLE = ['9', '3', '2', '4', '1', '5', '7', '6', '9', '2'] as const;

const FIELDS = Object.keys(FIELD_SAMPLES) as CorrectionField[];

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

/** Date ISO déterministe : base 2026-05-01T08:00Z + jours/minutes indexés. */
function createdAtFor(index: number): string {
  const base = Date.parse('2026-05-01T08:00:00.000Z');
  return new Date(base + (index % 30) * 24 * 3_600_000 + index * 7 * 60_000).toISOString();
}

/** Génère la i-ème correction « vue agent » (déterministe, NINA valide). */
function buildAgentCorrection(index: number): CorrectionRequest {
  const nina = buildNina({
    sex: index % 2 === 0 ? 1 : 2,
    year: pad(55 + ((index * 7) % 45), 2),
    month: pad(((index * 5) % 12) + 1, 2),
    region: REGION_CYCLE[index % REGION_CYCLE.length]!,
    cercle: pad(((index * 3) % 20) + 1, 2),
    commune: pad(100 + ((index * 13) % 900), 3),
    sequence: pad(100 + index, 3),
  });

  const field = FIELDS[index % FIELDS.length]!;
  const sample = FIELD_SAMPLES[field][index % 2]!;
  const status: CorrectionStatus =
    index % 5 === 3 ? 'APPROVED' : index % 5 === 4 ? 'REJECTED' : 'UNDER_REVIEW';
  const decided = status !== 'UNDER_REVIEW';

  // Score IA 40-98 ; ~1 sur 7 encore sans analyse (null).
  const aiScore = index % 7 === 6 ? null : 40 + (seedOf(`ai-${nina}`) % 59);
  const aiVerdict =
    aiScore === null ? null : aiScore >= 80 ? 'HIGH' : aiScore >= 60 ? 'MEDIUM' : 'LOW';

  const createdAt = createdAtFor(index);
  return buildCorrection(nina, {
    field,
    currentValue: sample.current,
    proposedValue: sample.proposed,
    reason: REQUEST_REASONS[index % REQUEST_REASONS.length]!,
    status,
    aiScore,
    aiVerdict,
    createdAt,
    reviewedBy: decided
      ? index % 2 === 0
        ? MOCK_ADMIN_REVIEWER_ID
        : MOCK_SECOND_REVIEWER_ID
      : null,
    decidedAt: decided ? new Date(Date.parse(createdAt) + 48 * 3_600_000).toISOString() : null,
    decisionReason: status === 'REJECTED' ? REJECT_REASONS[index % REJECT_REASONS.length]! : null,
  });
}

/**
 * Magasin initial : 2 fixtures citoyennes historiques (valeurs INCHANGÉES —
 * e2e citizen) + 48 demandes « vue agent ». 50 entrées au total ; répartition :
 * 31 UNDER_REVIEW, 10 APPROVED, 9 REJECTED.
 */
export function buildCorrectionStore(): CorrectionRequest[] {
  const citizenFixtures = [
    buildCorrection(DEFAULT_MOCK_NINA, {
      field: 'birthPlace',
      proposedValue: 'Sikasso',
      status: 'UNDER_REVIEW',
      aiScore: 87,
      aiVerdict: 'HIGH',
      createdAt: '2026-05-10T10:00:00.000Z',
    }),
    buildCorrection(DEFAULT_MOCK_NINA, {
      field: 'profession',
      proposedValue: 'Couturière',
      status: 'APPROVED',
      aiScore: 95,
      aiVerdict: 'HIGH',
      createdAt: '2026-04-22T10:00:00.000Z',
      decidedAt: '2026-04-25T14:30:00.000Z',
    }),
  ];
  const agentFixtures = Array.from({ length: 48 }, (_, i) => buildAgentCorrection(i));
  return [...citizenFixtures, ...agentFixtures];
}
