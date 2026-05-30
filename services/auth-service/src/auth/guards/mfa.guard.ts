/**
 * @file        mfa.guard.ts
 * @description Refuse l'accès si la route exige MFA et que le claim `mfa`
 *              n'est pas `true` dans l'access token.
 *
 *              Activé par le décorateur `@RequireMfa()`. Sans ce décorateur,
 *              la garde laisse passer. Doit s'exécuter APRÈS {@link JwtAuthGuard}.
 *
 * @module      auth-service/auth/guards
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MFA_KEY, type AuthSubject } from '@nina-aes/auth-guards';

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required !== true) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthSubject }>();
    if (request.user?.mfa !== true) {
      throw new ForbiddenException('AUTH_MFA_REQUIRED');
    }
    return true;
  }
}
