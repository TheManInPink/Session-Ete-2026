/**
 * @file        register-verify.dto.ts
 * @description DTO du `POST /auth/register/verify`.
 *
 *              Politique de mot de passe minimale (NIST 800-63B) :
 *                - ≥ 12 caractères
 *                - pas de patterns triviaux
 *              On laisse Keycloak appliquer la politique stricte côté IdP ;
 *              ici on filtre les cas évidents pour économiser un round-trip.
 *
 *              `username` est optionnel — si absent, le service dérive
 *              `email.split('@')[0]`.
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

const PASSWORD_MIN_LEN = 12;
const TRIVIAL_PASSWORDS = new Set([
  'password',
  'azerty',
  'qwerty',
  '123456',
  '123456789',
  'motdepasse',
]);

export const RegisterVerifySchema = z.object({
  phoneNumber: z.string().regex(/^\+\d{8,15}$/, 'phoneNumber doit être au format E.164'),
  otp: z.string().regex(/^\d{6}$/, 'OTP doit être 6 chiffres'),
  email: z.email().max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z
    .string()
    .min(PASSWORD_MIN_LEN, `password doit faire au moins ${PASSWORD_MIN_LEN} caractères`)
    .refine((v) => !TRIVIAL_PASSWORDS.has(v.toLowerCase()), 'password trop courant'),
  username: z.string().min(3).max(100).optional(),
  preferredLanguage: z.enum(['FR', 'BM', 'SNK', 'FF', 'TMQ', 'HAU', 'MOS', 'DJE']).optional(),
});

export type RegisterVerifyDto = z.infer<typeof RegisterVerifySchema>;
