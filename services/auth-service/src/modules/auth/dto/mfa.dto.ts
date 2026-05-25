/**
 * @file        mfa.dto.ts
 * @description DTOs des endpoints MFA.
 *
 *              - Setup TOTP : pas de body (le userId vient du JWT).
 *              - Confirm TOTP : { code }.
 *              - Verify (TOTP/SMS) : { challenge, code }.
 *              - Challenge SMS : { challenge }.
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

/** Code à 6 chiffres TOTP (RFC 6238) ou OTP SMS. */
const codeField = z.string().regex(/^\d{6}$/, 'code doit être 6 chiffres');

/** Challenge MFA = JWT compact (3 segments séparés par `.`). */
const challengeField = z
  .string()
  .min(20)
  .max(4096)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'challenge doit être un JWT compact');

export const MfaConfirmTotpSchema = z.object({ code: codeField });
export type MfaConfirmTotpDto = z.infer<typeof MfaConfirmTotpSchema>;

export const MfaVerifyTotpSchema = z.object({
  challenge: challengeField,
  code: codeField,
});
export type MfaVerifyTotpDto = z.infer<typeof MfaVerifyTotpSchema>;

export const MfaChallengeSmsSchema = z.object({ challenge: challengeField });
export type MfaChallengeSmsDto = z.infer<typeof MfaChallengeSmsSchema>;

export const MfaVerifySmsSchema = z.object({
  challenge: challengeField,
  code: codeField,
});
export type MfaVerifySmsDto = z.infer<typeof MfaVerifySmsSchema>;
