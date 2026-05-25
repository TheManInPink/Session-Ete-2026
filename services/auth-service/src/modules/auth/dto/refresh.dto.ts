/**
 * @file        refresh.dto.ts
 * @description DTO du `POST /auth/refresh`.
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

export const RefreshSchema = z.object({
  refresh: z.string().min(20).max(4096),
});

export type RefreshDto = z.infer<typeof RefreshSchema>;
