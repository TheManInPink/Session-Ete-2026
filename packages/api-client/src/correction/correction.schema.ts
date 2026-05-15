/**
 * @file        correction.schema.ts
 * @description Schémas Zod pour les demandes de correction NINA (Bloc A).
 *              Alignés sur `@nina-aes/shared-types` côté backend.
 * @module      @nina-aes/api-client
 */

import { z } from 'zod';

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

/** Demande de correction côté API. */
export const CorrectionRequestSchema = z.object({
  id: z.string().uuid(),
  citizenId: z.string().uuid(),
  nina: z.string().regex(/^\d{14}[A-Z]$/),
  field: CorrectionFieldSchema,
  currentValue: z.string().max(2000),
  proposedValue: z.string().max(2000),
  reason: z.string().max(2000).nullable(),
  justificationDocUrl: z.string().url().nullable(),
  /** Score de confiance IA 0-100 (peut être absent si non encore traité). */
  aiScore: z.number().min(0).max(100).nullable(),
  aiVerdict: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  status: CorrectionStatusSchema,
  reviewedBy: z.string().uuid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  decisionReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** DTO de création d'une correction (envoyé depuis le frontend). */
export const CreateCorrectionDtoSchema = z.object({
  nina: z.string().regex(/^\d{14}[A-Z]$/),
  field: CorrectionFieldSchema,
  proposedValue: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(10).max(2000),
  justificationDocUrl: z.string().url().optional(),
});

/** Réponse paginée. */
export const CorrectionListSchema = z.object({
  items: z.array(CorrectionRequestSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type CorrectionStatus = z.infer<typeof CorrectionStatusSchema>;
export type CorrectionField = z.infer<typeof CorrectionFieldSchema>;
export type CorrectionRequest = z.infer<typeof CorrectionRequestSchema>;
export type CreateCorrectionDto = z.infer<typeof CreateCorrectionDtoSchema>;
export type CorrectionList = z.infer<typeof CorrectionListSchema>;
