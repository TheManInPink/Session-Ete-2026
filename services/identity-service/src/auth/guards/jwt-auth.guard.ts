/**
 * @file        jwt-auth.guard.ts
 * @description Guard d'AUTHENTIFICATION (fail-closed). Extrait le Bearer token,
 *              le vérifie cryptographiquement via le {@link JwtVerifier} injecté
 *              (RS256/JWKS d'auth-service), puis peuple `request.user`.
 *
 *              Les routes `@Public()` (méthode ou classe) sont court-circuitées.
 *              Toute autre route SANS token valide ⇒ 401 (fail-closed) : il
 *              n'existe AUCUN bypass d'auth silencieux.
 *
 *              Mode `NINA_AUTH_MODE=mock` (dev local sans auth-service) :
 *                - injecte un user déterministe (role=agent),
 *                - 🔒 STRICTEMENT non-production : si `NODE_ENV=production`, le
 *                  mode mock est IGNORÉ (auth réelle forcée). Un bypass total en
 *                  prod serait la faille même que ce guard ferme.
 *
 *              ⚠️ Classe LOCALE au service (ADR-027) — ne JAMAIS l'extraire dans
 *              un package partagé (duplication `@nestjs/core` → `Reflector`
 *              cassé, `UnknownDependenciesException`).
 *
 * @module      identity-service/auth/guards
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@nina-aes/shared-types';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JWT_VERIFIER, type AuthSubject, type JwtVerifier } from '../auth.types';

/** User enrichi attaché à la requête (claims utiles aux guards d'ownership). */
export type RequestUser = AuthenticatedUser & { nina?: string; mfa?: boolean };

/**
 * Normalise un rôle textuel (claim JWT, ex. `'agent'`) vers l'enum
 * `UserRole` (shared-types, ex. `UserRole.AGENT`). Insensible à la casse.
 * Retourne `undefined` si le rôle n'est pas reconnu (→ refus en aval).
 *
 * @param raw Rôle brut issu du token.
 */
function normalizeRole(raw: string | undefined): UserRole | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  return (Object.values(UserRole) as string[]).includes(upper) ? (upper as UserRole) : undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  /** Mode dev uniquement (jamais effectif en production — cf. canActivate). */
  private readonly mockMode = process.env.NINA_AUTH_MODE === 'mock';
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Autorise si `@Public()`, sinon exige un Bearer token valide et peuple
   * `request.user`.
   *
   * @param context Contexte d'exécution Nest.
   * @returns `true` si la requête peut continuer.
   * @throws UnauthorizedException (401) si non public et token absent/invalide.
   */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();

    // ── Mode mock : dev local SANS auth-service, JAMAIS en production ────
    if (this.mockMode && !this.isProduction) {
      req.user = req.user ?? {
        id: 'mock-agent-001',
        email: 'agent.mock@ctdec.gouv.ml',
        role: UserRole.AGENT,
        region: 'ML-09',
        mfa: true,
      };
      return true;
    }
    if (this.mockMode && this.isProduction) {
      // Garde-fou explicite : on n'autorise PAS le bypass en prod.
      this.logger.error(
        'NINA_AUTH_MODE=mock IGNORÉ en production — authentification réelle requise.',
      );
    }

    // ── Authentification réelle (RS256/JWKS) ────────────────────────────
    const token = this.extractBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    // verifyAccess lève UnauthorizedException sur token invalide/expiré.
    const subject: AuthSubject = this.verifier.verifyAccess(token);

    const role = normalizeRole(subject.role);
    if (!role) {
      // Rôle inconnu = on ne fait pas confiance au token (fail-closed).
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }

    req.user = {
      id: subject.userId,
      role,
      mfa: subject.mfa,
      ...(subject.email ? { email: subject.email } : {}),
      ...(subject.nina ? { nina: subject.nina } : {}),
    };
    return true;
  }

  /** Extrait le token d'un en-tête `Authorization: Bearer <jwt>`. */
  private extractBearer(header: string | string[] | undefined): string | null {
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) return null;
    const [scheme, token] = raw.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
