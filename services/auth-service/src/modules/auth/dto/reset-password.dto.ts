/**
 * @file        reset-password.dto.ts
 * @description DTO du `POST /auth/password/reset`.
 *
 *              Même politique de mot de passe minimale que `/register/verify` :
 *              ≥ 12 caractères, pas de patterns triviaux. La politique stricte
 *              reste appliquée par Keycloak (cf. realm policy Phase 9).
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

export const ResetPasswordSchema = z.object({
  /** JWT reset (purpose='password-reset') émis par `/auth/password/forgot`. */
  token: z
    .string()
    .min(20)
    .max(4096)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'token doit être un JWT compact'),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LEN, `newPassword doit faire au moins ${PASSWORD_MIN_LEN} caractères`)
    .refine((v) => !TRIVIAL_PASSWORDS.has(v.toLowerCase()), 'newPassword trop courant'),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
