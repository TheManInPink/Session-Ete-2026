/**
 * @file        register-request-otp.dto.ts
 * @description DTO du `POST /auth/register/request-otp`.
 *
 *              Le numéro de téléphone doit être au format E.164 (`+223...`).
 *              On n'accepte pas de format local — le client (web/USSD/mobile)
 *              normalise avant l'appel.
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

export const RegisterRequestOtpSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+\d{8,15}$/, 'phoneNumber doit être au format E.164 (ex. +22370123456)'),
});

export type RegisterRequestOtpDto = z.infer<typeof RegisterRequestOtpSchema>;
