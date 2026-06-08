/**
 * @file        roles.guard.ts
 * @description Guard RBAC — vérifie `@Roles(...)` contre `req.user.role`.
 *              Comparaison INSENSIBLE À LA CASSE. Si aucun `@Roles()` n'est
 *              posé, l'accès est autorisé. DOIT s'exécuter APRÈS
 *              {@link JwtAuthGuard}. ADR-027 : classe LOCALE.
 *
 * @module      notification-service/auth/guards
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
    const role = request.user?.role?.toLowerCase();
    const allowed = required.map((r) => r.toLowerCase());
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException('AUTH_FORBIDDEN_ROLE');
    }
    return true;
  }
}
