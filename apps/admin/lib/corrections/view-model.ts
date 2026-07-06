/**
 * @file        view-model.ts
 * @description Adaptateur AD-02 : `CorrectionRequest` (contrat @nina-aes/api-client)
 *              → modèle de vue de la console agent.
 *
 *              Tout est dérivé de champs backend RÉELS — rien d'inventé :
 *                - `citizenName` : join `citizen` (routes agent), sinon « — » ;
 *                - `region`     : décodée du CHIFFRE RÉGION du NINA (position 5,
 *                                 cf. `parseNina` de @nina-aes/utils) ;
 *                - `hasJustificatif` : `justificationDocUrl != null` ;
 *                - `timeline`   : synthétisée depuis les seuls jalons persistés
 *                                 (création, score IA si présent, décision si
 *                                 `decidedAt`).
 *
 *              Les concepts sans source backend (sous-scores IA détaillés,
 *              statut `AWAITING_DOCUMENT`) ont été retirés de la vue — l'UI se
 *              dégrade proprement au lieu de mentir.
 *
 * @module      @nina-aes/admin
 */

import { parseNina } from '@nina-aes/utils';
import type {
  AiVerdict,
  CorrectionField,
  CorrectionRequest,
  CorrectionStatus,
} from '@nina-aes/api-client';

/**
 * Noms courts des régions administratives, indexés par le chiffre région du
 * NINA (même sémantique que le générateur démo de @nina-aes/api-client).
 */
const REGION_NAMES: Record<string, string> = {
  '1': 'Kayes',
  '2': 'Koulikoro',
  '3': 'Sikasso',
  '4': 'Ségou',
  '5': 'Mopti',
  '6': 'Tombouctou',
  '7': 'Gao',
  '8': 'Kidal',
  '9': 'Bamako',
};

/**
 * Jalons de la timeline AD-02 réellement dérivables du backend. Les anciens
 * jalons fictifs (AGENT_REVIEW, DOCUMENT_REQUESTED, DOCUMENT_UPLOADED) n'ont
 * aucune colonne source : ils n'existent plus dans la vue.
 */
export type AdminTimelineKind = 'SUBMITTED' | 'AI_SCORED' | 'APPROVED' | 'REJECTED';

/** Événement timeline pour la fiche correction (drawer AD-02). */
export interface AdminTimelineEvent {
  /** ISO-8601. */
  at: string;
  /** Type d'événement métier. */
  kind: AdminTimelineKind;
  /** Acteur (nom affichable ou null pour les événements système). */
  actor: string | null;
  /** Note libre (ex. motif de rejet). */
  note?: string;
}

/** Modèle de vue agent d'une demande de correction. */
export interface AdminCorrectionView {
  id: string;
  nina: string;
  /** Nom du demandeur (join citoyen) ou « — » si le join est absent. */
  citizenName: string;
  field: CorrectionField;
  currentValue: string;
  proposedValue: string;
  reason: string | null;
  /** Score de confiance IA 0-100, `null` si non encore analysé. */
  aiScore: number | null;
  aiVerdict: AiVerdict | null;
  status: CorrectionStatus;
  /** Nom de région dérivé du NINA (« — » si indéterminable). */
  region: string;
  hasJustificatif: boolean;
  /** URL du justificatif (MinIO signée), `null` si aucun. */
  justificationDocUrl: string | null;
  /** Date de soumission (= `createdAt` backend). */
  submittedAt: string;
  /** Motif de la décision (rejet), `null` sinon. */
  decisionReason: string | null;
  timeline: AdminTimelineEvent[];
}

/**
 * Dérive le nom de région du chiffre région d'un NINA (position 5).
 *
 * @param nina - NINA en 15 caractères (déjà validé par le schéma Zod).
 * @returns Le nom court de la région, ou « — » si le NINA est inexploitable.
 */
export function regionFromNina(nina: string): string {
  try {
    return REGION_NAMES[parseNina(nina).region] ?? '—';
  } catch {
    return '—';
  }
}

/**
 * Synthétise la timeline depuis les seuls champs réels de la demande :
 * création (`createdAt`), score IA (si `aiScore` non null — le backend ne
 * persiste pas d'horodatage d'analyse distinct, on réutilise `createdAt`),
 * décision (si `decidedAt`, avec `decisionReason` en note).
 */
function buildTimeline(c: CorrectionRequest, citizenName: string): AdminTimelineEvent[] {
  const events: AdminTimelineEvent[] = [
    {
      at: c.createdAt,
      kind: 'SUBMITTED',
      actor: citizenName === '—' ? null : citizenName,
    },
  ];
  if (c.aiScore !== null) {
    events.push({ at: c.createdAt, kind: 'AI_SCORED', actor: null });
  }
  if (c.decidedAt && (c.status === 'APPROVED' || c.status === 'REJECTED')) {
    events.push({
      at: c.decidedAt,
      kind: c.status,
      actor: null,
      note: c.decisionReason ?? undefined,
    });
  }
  return events;
}

/**
 * Convertit une `CorrectionRequest` du contrat API en modèle de vue AD-02.
 *
 * @param c - Demande telle que renvoyée par `api.correction.list()`.
 */
export function toAdminCorrectionView(c: CorrectionRequest): AdminCorrectionView {
  const citizenName = c.citizen ? `${c.citizen.firstName} ${c.citizen.lastName}` : '—';
  return {
    id: c.id,
    nina: c.nina,
    citizenName,
    field: c.field,
    currentValue: c.currentValue,
    proposedValue: c.proposedValue,
    reason: c.reason,
    aiScore: c.aiScore,
    aiVerdict: c.aiVerdict,
    status: c.status,
    region: regionFromNina(c.nina),
    hasJustificatif: c.justificationDocUrl !== null,
    justificationDocUrl: c.justificationDocUrl,
    submittedAt: c.createdAt,
    decisionReason: c.decisionReason,
    timeline: buildTimeline(c, citizenName),
  };
}

/**
 * Options du filtre région, dérivées des données affichées (uniques, triées
 * alphabétiquement, « — » en dernier).
 */
export function regionOptions(views: readonly AdminCorrectionView[]): string[] {
  const unique = [...new Set(views.map((v) => v.region))];
  return unique.sort((a, b) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b, 'fr')));
}
