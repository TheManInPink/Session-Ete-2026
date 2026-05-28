/**
 * @file        revoke.dto.ts
 * @description Validation Zod du body DELETE /api/v1/documents/:id.
 * @module      document-service/documents/dto
 */
import { z } from 'zod';

export const RevokeSchema = z
  .object({
    reason: z.enum(['DECEASED', 'FRAUD_DETECTED', 'DATA_CORRECTION', 'CITIZEN_REQUEST', 'OTHER']),
    reasonText: z.string().max(500).optional(),
  })
  .strict();

export type RevokeInput = z.infer<typeof RevokeSchema>;
