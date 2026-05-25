/**
 * @file        forgot-password.dto.ts
 * @description DTO du `POST /auth/password/forgot`.
 *
 *              `identifier` accepte un email OU un username. La résolution
 *              se fait côté service ; la réponse est uniforme (toujours
 *              202 Accepted) pour ne pas révéler l'existence d'un compte.
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  identifier: z.string().min(3).max(200),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
