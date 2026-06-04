/**
 * @file        current-user.decorator.ts
 * @description Décorateur de paramètre `@CurrentUser()` exposant le sujet
 *              authentifié peuplé par {@link JwtAuthGuard} (`request.user`).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/auth
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthSubject } from '@nina-aes/auth-guards';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthSubject | undefined => {
    return ctx.switchToHttp().getRequest<{ user?: AuthSubject }>().user;
  },
);
