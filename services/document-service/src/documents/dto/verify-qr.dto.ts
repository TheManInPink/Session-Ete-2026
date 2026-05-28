/**
 * @file        verify-qr.dto.ts
 * @description Validation Zod du body POST /api/v1/public/documents/verify-qr.
 * @module      document-service/documents/dto
 */
import { z } from 'zod';

export const VerifyQrSchema = z
  .object({
    /** JWT brut extrait du QR code (header.payload.signature). */
    token: z
      .string()
      .min(20, 'token trop court')
      .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'token JWT mal formé'),
  })
  .strict();

export type VerifyQrInput = z.infer<typeof VerifyQrSchema>;
