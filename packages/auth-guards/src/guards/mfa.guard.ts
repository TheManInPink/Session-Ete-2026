/**
 * @file        mfa.guard.ts
 * @description Refuse l'accès si la route exige MFA et que le claim `mfa`
 *              n'est pas `true` dans l'access token.
 *
 *              Activé par le décorateur {@link RequireMfa}. Sans ce
 *              décorateur, la garde laisse passer — elle ne durcit que
 *              les routes annotées.
 *
 *              Doit s'exécuter APRÈS {@link JwtAuthGuard} (qui peuple
 *              `request.user`). Le code d'erreur `AUTH_MFA_REQUIRED`
 *              indique au client qu'il doit présenter un token post-MFA.
 *
 * @module      @nina-aes/auth-guards
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRE_MFA_KEY } from '../decorators/require-mfa.decorator.js';
import type { AuthSubject } from '../types.js';

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
