/**
 * @file        logout.dto.ts
 * @description DTO du `POST /auth/logout`. Le client soumet le refresh
 *              token pour révocation atomique (jti + famille).
 *
 *              L'access token courant n'est pas révoqué côté serveur (TTL
 *              court 15 min) — c'est volontaire : pas de blacklist
 *              d'access tokens pour éviter une lookup Redis par requête.
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

export const LogoutSchema = z.object({
  refresh: z.string().min(20).max(4096),
});

export type LogoutDto = z.infer<typeof LogoutSchema>;
