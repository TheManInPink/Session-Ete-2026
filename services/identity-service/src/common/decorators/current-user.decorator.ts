/**
 * @file        current-user.decorator.ts
 * @description Décorateur `@CurrentUser()` pour récupérer le user authentifié
 *              depuis la requête (injecté par RolesGuard / JWT middleware).
 *
 *              Usage :
 *                ```ts
 *                @Get('me')
 *                async me(@CurrentUser() user: AuthenticatedUser) {
 *                  return user;
 *                }
 *                ```
 *
 * @module      identity-service/common
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@nina-aes/shared-types';
import type { Request } from 'express';

/** Forme minimale du user authentifié injectée dans la requête. */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: UserRole;
  region?: string;
  ninaAgentCode?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    return req.user;
  },
);
