/**
 * @file        roles.guard.ts
 * @description Vérifie que `request.user.role` figure dans la liste déclarée
 *              par `@Roles()` sur la méthode ou le controller. Doit s'exécuter
 *              APRÈS {@link JwtAuthGuard}.
 *
 * @module      document-service/auth/guards
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, type AuthSubject } from '@nina-aes/auth-guards';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthSubject }>();
    const role = request.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('AUTH_FORBIDDEN_ROLE');
    }
    return true;
  }
}
