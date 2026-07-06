/**
 * @file        correction.schema.ts
 * @description Schémas Zod pour les demandes de correction NINA (Bloc A).
 *              Alignés sur `@nina-aes/shared-types` et sur le controller réel
 *              `identity-service/src/modules/correction` (le code fait foi).
 * @module      @nina-aes/api-client
 */

import { z } from 'zod';

/** Format NINA : 14 chiffres + 1 lettre de contrôle. */
const NINA_REGEX = /^\d{14}[A-Z]$/;

/**
 * Schémas d'URL dangereux à bannir d'une URL de justificatif : rendus dans un
 * `href`, ils exécuteraient du code (`javascript:`) ou embarqueraient une
 * charge utile (`data:`) — XSS stocké dans la console admin (React ne neutralise
 * PAS ces `href`). Défense en profondeur : ce refus au contrat DOIT être doublé
 * d'une garde au rendu (n'autoriser que http/https côté composant).
 */
const DANGEROUS_URL_SCHEMES = /^\s*(?:javascript|data|vbscript|file):/i;

/** URL de justificatif « sûre » : URL valide dont le schéma n'est pas dangereux. */
const SafeDocUrlSchema = z.url().refine((u) => !DANGEROUS_URL_SCHEMES.test(u), {
  message: "Schéma d'URL de justificatif non autorisé",
});

/** Statuts du cycle de vie d'une correction. */
export const CorrectionStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

/** Champ d'un citoyen modifiable via une correction. */
export const CorrectionFieldSchema = z.enum([
  'firstName',
  'lastName',
  'birthDate',
  'birthPlace',
  'residence_cercle',
  'residence_commune',
  'fatherName',
  'motherName',
  'profession',
]);

/** Verdict de confiance IA exposé aux écrans (échelle publique). */
export const AiVerdictSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

/**
 * Le backend persiste le verdict **brut** d'ai-service (`auto_approve` |
 * `agent_review` | `auto_reject`, cf. `correction.service.ts`) alors que le
 * contrat public expose une échelle de confiance. On normalise sur le fil :
 * `auto_approve → HIGH`, `agent_review → MEDIUM`, `auto_reject → LOW`.
 * Toute autre valeur non nulle échoue la validation (fail-closed).
 */
const AI_VERDICT_FROM_WIRE: ReadonlyMap<string, z.infer<typeof AiVerdictSchema>> = new Map([
  ['auto_approve', 'HIGH'],
  ['agent_review', 'MEDIUM'],
  ['auto_reject', 'LOW'],
]);

const AiVerdictWireSchema = z.preprocess(
  (v) => (typeof v === 'string' ? (AI_VERDICT_FROM_WIRE.get(v) ?? v) : v),
  AiVerdictSchema.nullable(),
);

/**
 * Score de confiance IA 0-100. Prisma sérialise ses `Decimal` en **chaîne**
 * dans le JSON (ex. `"87.5"`) : on accepte les deux formes et on normalise en
 * nombre (une chaîne non numérique échoue la validation — fail-closed).
 */
const AiScoreSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
  z.number().min(0).max(100).nullable(),
);

/**
 * Join citoyen **léger** renvoyé par `GET /api/v1/corrections` (vue agent) :
 * `include: { citizen: { select: { id, nina, firstName, lastName } } }`.
 * Objet non-strict : le `GET /:id` joint le citoyen complet, les colonnes
 * supplémentaires sont simplement ignorées.
 */
export const CorrectionCitizenJoinSchema = z.object({
  id: z.uuid(),
  nina: z.string().regex(NINA_REGEX),
  firstName: z.string(),
  lastName: z.string(),
});

/** Demande de correction côté API (contrat public consommé par les écrans). */
export const CorrectionRequestSchema = z.object({
  id: z.uuid(),
  citizenId: z.uuid(),
  nina: z.string().regex(NINA_REGEX),
  field: CorrectionFieldSchema,
  currentValue: z.string().max(2000),
  proposedValue: z.string().max(2000),
  reason: z.string().max(2000).nullable(),
  justificationDocUrl: SafeDocUrlSchema.nullable(),
  /** Score de confiance IA 0-100 (peut être absent si non encore traité). */
  aiScore: AiScoreSchema,
  aiVerdict: AiVerdictWireSchema,
  status: CorrectionStatusSchema,
  reviewedBy: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /**
   * Join citoyen (routes agent uniquement — absent des réponses de
   * soumission citoyenne). Sert aux écrans AD-02 pour afficher le demandeur
   * sans requête supplémentaire.
   */
  citizen: CorrectionCitizenJoinSchema.optional(),
});

/** DTO de création d'une correction (envoyé depuis le frontend). */
export const CreateCorrectionDtoSchema = z.object({
  nina: z.string().regex(NINA_REGEX),
  field: CorrectionFieldSchema,
  proposedValue: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(10).max(2000),
  justificationDocUrl: SafeDocUrlSchema.optional(),
});

/**
 * DTO de rejet d'une correction — motif **obligatoire** (min 20 caractères),
 * calqué sur `RejectCorrectionDto` du backend.
 */
export const RejectCorrectionDtoSchema = z.object({
  reason: z.string().trim().min(20).max(2000),
});

/** Réponse paginée **publique** (`items`) — contrat des écrans PC-05 / AD-02. */
export const CorrectionListSchema = z.object({
  items: z.array(CorrectionRequestSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

// ── Schémas « fil » (forme brute renvoyée par identity-service) ───────────────

/**
 * Ligne de correction telle que renvoyée par identity-service : le NINA ne vit
 * PAS sur la ligne (pas de colonne `nina` dans `correction_requests`), il est
 * porté par le join `citizen`. Le client normalise vers le contrat public en
 * remontant `citizen.nina` (cf. `CorrectionClient`).
 */
export const CorrectionWireItemSchema = CorrectionRequestSchema.extend({
  nina: z.string().regex(NINA_REGEX).optional(),
});

/**
 * Réponse brute de `GET /api/v1/corrections` : clé `data` (pas `items`),
 * cf. `CorrectionService.list()`. Normalisée en {@link CorrectionListSchema}
 * par `CorrectionClient.list()` pour ne pas casser les consommateurs citizen.
 */
export const CorrectionListResponseSchema = z.object({
  data: z.array(CorrectionWireItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type CorrectionStatus = z.infer<typeof CorrectionStatusSchema>;
export type CorrectionField = z.infer<typeof CorrectionFieldSchema>;
export type AiVerdict = z.infer<typeof AiVerdictSchema>;
export type CorrectionCitizenJoin = z.infer<typeof CorrectionCitizenJoinSchema>;
export type CorrectionRequest = z.infer<typeof CorrectionRequestSchema>;
export type CreateCorrectionDto = z.infer<typeof CreateCorrectionDtoSchema>;
export type RejectCorrectionDto = z.infer<typeof RejectCorrectionDtoSchema>;
/**
 * Réponse brute de `GET /api/v1/corrections/me` : liste NON paginée des
 * corrections du citoyen authentifié (NINA dérivé du token), cf.
 * `CorrectionService.listForCitizen()`. Le NINA vit sur le join `citizen`.
 */
export const MyCorrectionsResponseSchema = z.object({
  data: z.array(CorrectionWireItemSchema),
  total: z.number().int().nonnegative(),
});

export type CorrectionList = z.infer<typeof CorrectionListSchema>;
export type CorrectionWireItem = z.infer<typeof CorrectionWireItemSchema>;
export type CorrectionListResponse = z.infer<typeof CorrectionListResponseSchema>;
export type MyCorrectionsResponse = z.infer<typeof MyCorrectionsResponseSchema>;
