/**
 * @file        generate-fdi.dto.ts
 * @description Validation Zod du body POST /api/v1/documents/fdi.
 * @module      document-service/documents/dto
 */
import { z } from 'zod';

/** NINA : 14 chiffres + 1 lettre majuscule de contrôle. */
const NINA_REGEX = /^\d{14}[A-Z]$/;

export const GenerateFdiSchema = z
  .object({
    nina: z.string().regex(NINA_REGEX, 'NINA invalide (14 chiffres + 1 lettre)'),
    language: z.enum(['fra', 'bam', 'snk', 'fuv']).optional().default('fra'),
  })
  .strict();

export type GenerateFdiInput = z.infer<typeof GenerateFdiSchema>;
