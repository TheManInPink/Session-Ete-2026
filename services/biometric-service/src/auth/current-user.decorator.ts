/**
 * @file        current-user.decorator.ts
 * @description Décorateur de paramètre `@CurrentUser()` exposant le sujet
 *              authentifié peuplé par {@link JwtAuthGuard} (`request.user`).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/auth
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { BioAuthSubject } from './auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BioAuthSubject | undefined => {
    return ctx.switchToHttp().getRequest<{ user?: BioAuthSubject }>().user;
  },
);
