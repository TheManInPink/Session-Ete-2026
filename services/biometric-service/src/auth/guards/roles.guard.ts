/**
 * @file        roles.guard.ts
 * @description Guard RBAC — vérifie `@Roles(...)` contre `req.user.role`.
 *              Comparaison INSENSIBLE À LA CASSE. Si aucun `@Roles()` n'est
 *              posé, l'accès est autorisé. DOIT s'exécuter APRÈS
 *              {@link JwtAuthGuard}. ADR-027 : classe LOCALE.
 *
 *              Rôles biométrie (cf. doc 25 §4.8, DPIA §3.4) :
 *                - `biometric_operator` : enrôlement + vérification 1:1 ;
 *                - `inspector`          : recherche 1:N (P3c, 4-yeux + mandat).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/auth/guards
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@nina-aes/auth-guards';
import type { BioAuthSubject } from '../auth.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: BioAuthSubject }>();
    const role = request.user?.role?.toLowerCase();
    const allowed = required.map((r) => r.toLowerCase());
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException('AUTH_FORBIDDEN_ROLE');
    }
    return true;
  }
}
