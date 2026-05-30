/**
 * @file        jwt-auth.guard.ts
 * @description Garde JWT RS256 local au document-service. Valide via
 *              {@link JwtVerifier} injecté (JwksJwtVerifier qui interroge
 *              auth-service `/.well-known/jwks.json`).
 *
 *              ⚠️  Classe **locale au service** (ADR-027) — ne JAMAIS l'extraire
 *              dans un package workspace partagé : ça force la duplication
 *              physique de `@nestjs/core` côté pnpm store et casse l'identité
 *              de `Reflector` (UnknownDependenciesException).
 *
 * @module      document-service/auth/guards
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, JWT_VERIFIER, type JwtVerifier } from '@nina-aes/auth-guards';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();

    const token = this.extractBearer(request.headers.authorization);
    if (!token) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    request.user = this.verifier.verifyAccess(token);
    return true;
  }

  private extractBearer(header: string | string[] | undefined): string | null {
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) return null;
    const [scheme, token] = raw.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
