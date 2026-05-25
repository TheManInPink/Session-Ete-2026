/**
 * @file        login.dto.ts
 * @description DTO du `POST /auth/login`.
 *
 *              `identifier` accepte l'email OU le username — la résolution
 *              se fait côté Keycloak (qui supporte les deux par défaut).
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

export const LoginSchema = z.object({
  identifier: z.string().min(3).max(200),
  password: z.string().min(1).max(256),
});

export type LoginDto = z.infer<typeof LoginSchema>;
