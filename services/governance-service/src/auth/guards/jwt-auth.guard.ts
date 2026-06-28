/**
 * @file        jwt-auth.guard.ts
 * @description Guard JWT RS256 local — valide via le `JwtVerifier` injecté
 *              (JwksJwtVerifier interrogeant auth-service). Respecte `@Public()`.
 *
 *              ADR-027 : classe LOCALE au service (jamais dans un package
 *              workspace partagé — duplication de `@nestjs/core` côté pnpm
 *              casse l'identité de `Reflector`).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/auth/guards
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

  /** Autorise si `@Public()`, sinon vérifie le Bearer token et peuple `req.user`. */
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

  /** Extrait le token d'un header `Authorization: Bearer <token>`. */
  private extractBearer(header: string | string[] | undefined): string | null {
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) return null;
    const [scheme, token] = raw.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
