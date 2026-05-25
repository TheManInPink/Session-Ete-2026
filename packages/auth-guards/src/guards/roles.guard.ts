/**
 * @file        roles.guard.ts
 * @description Vérifie que `request.user.role` figure dans la liste déclarée
 *              par {@link Roles} sur la méthode ou le controller.
 *
 *              Si aucun décorateur {@link Roles} n'est posé, l'accès est
 *              autorisé (la garde ne durcit que les routes annotées).
 *
 *              DOIT être appliqué APRÈS {@link JwtAuthGuard} (qui peuple
 *              `request.user`). Ordre recommandé dans le module :
 *              `[JwtAuthGuard, RolesGuard, MfaGuard]`.
 *
 * @module      @nina-aes/auth-guards
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthSubject } from '../types.js';

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
