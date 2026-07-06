/**
 * @file        roles.guard.ts
 * @description Guard d'AUTORISATION par rôle (RBAC). Lit la métadonnée posée par
 *              `@Roles(...)` et vérifie que `request.user.role` y figure.
 *
 *              DOIT s'exécuter APRÈS {@link JwtAuthGuard} (qui pose et NORMALISE
 *              `request.user`). L'authentification ayant déjà eu lieu, une route
 *              sans `@Roles()` n'est PAS « ouverte » : elle reste protégée par
 *              le JwtAuthGuard (Bearer requis sauf `@Public()`). Le RBAC ne fait
 *              qu'ajouter une restriction de rôle quand `@Roles()` est présent.
 *
 *              Comparaison INSENSIBLE À LA CASSE (robustesse claim JWT lowercase
 *              ↔ enum UserRole uppercase). PAS de précédence d'opérateur piégeuse.
 *
 *              ⚠️ Classe LOCALE au service (ADR-027).
 *
 * @module      identity-service/auth/guards
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@nina-aes/shared-types';
import type { Request } from 'express';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { RequestUser } from './jwt-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  /**
   * Vérifie que le rôle de l'appelant figure dans la liste `@Roles(...)`.
   *
   * @param context Contexte d'exécution Nest.
   * @returns `true` si aucun `@Roles()` n'est posé OU si le rôle est autorisé.
   * @throws ForbiddenException (403) si le rôle n'est pas dans la liste requise.
   */
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Pas de @Roles() → l'auth (JwtAuthGuard) a déjà eu lieu ; on ne RESTREINT
    // pas davantage. (Ce n'est PAS fail-open : sans @Public(), le Bearer était
    // obligatoire en amont.)
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const role = req.user?.role;

    const allowed = required.map((r) => String(r).toLowerCase());
    const actual = role ? String(role).toLowerCase() : undefined;

    if (!actual || !allowed.includes(actual)) {
      this.logger.warn(
        `Accès refusé : user=${req.user?.id ?? '∅'} role=${role ?? '∅'} ` +
          `requis=[${required.join(',')}]`,
      );
      throw new ForbiddenException('AUTH_FORBIDDEN_ROLE');
    }
    return true;
  }
}
