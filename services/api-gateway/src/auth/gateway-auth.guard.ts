/**
 * @file        gateway-auth.guard.ts
 * @description Guard GLOBAL d'authentification du gateway — responsabilité n°2 :
 *              « Vérifie le JWT UNE SEULE FOIS et propage le user aux services
 *              internes via X-User-Context (signé JWS) ».
 *
 *              Exécuté AVANT le controller catch-all, il :
 *                1. Supprime systématiquement les en-têtes d'identité que le
 *                   client pourrait tenter de forger (anti-spoofing).
 *                2. Détermine si la route est publique (table de routage,
 *                   surfaces locales health/metrics/swagger).
 *                3. Sur route protégée : valide le Bearer RS256 (JWKS), attache
 *                   le sujet à la requête et pré-signe le JWS `X-User-Context`.
 *
 *              ADR-027 : guard LOCAL au service (jamais dans un package partagé).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/auth
 */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT_VERIFIER, type AuthSubject, type JwtVerifier } from '@nina-aes/auth-guards';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';
import type { Env } from '../config/env.schema.js';
import type { GatewayRequest } from './gateway-request.js';
import { isPublicEndpoint, matchRoute } from '../modules/proxy/proxy.routes.js';
import { UserContextSigner } from './user-context.signer.js';

/**
 * Surfaces gateway-locales accessibles SANS JWT :
 *   - openapi.json : la spec agrégée doit être lisible par les outils.
 *   - info         : métadonnées de version (non sensibles).
 * Les autres routes `/api/v1/api-gateway/*` (routes, breakers) sont protégées.
 */
const LOCAL_PUBLIC_PREFIXES = ['/api/v1/api-gateway/openapi.json', '/api/v1/api-gateway/info'];

/** En-têtes d'identité interdits en entrée (le gateway est seul à les émettre). */
const SPOOFABLE_IDENTITY_HEADERS = ['x-user-context', 'x-user-id', 'x-user-role'] as const;

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  private readonly authRequired: boolean;

  constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
    private readonly signer: UserContextSigner,
    cfg: ConfigService<Env, true>,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {
    this.authRequired = cfg.get('AUTH_REQUIRED', { infer: true });
  }

  /**
   * Point d'entrée du guard.
   *
   * @returns `true` si la requête peut continuer (route publique ou JWT valide).
   * @throws HttpException(401, E_GW_004) si un JWT est requis et absent/invalide.
   */
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GatewayRequest>();

    // 1. Anti-spoofing : un client externe ne doit JAMAIS pouvoir injecter
    //    une identité. On purge ces en-têtes AVANT toute logique.
    for (const h of SPOOFABLE_IDENTITY_HEADERS) {
      delete req.headers[h];
    }

    const path = (req.originalUrl.split('?')[0] || req.path) ?? '';

    // 2. Surfaces non préfixées /api/v1 → locales (health, metrics, swagger).
    if (!path.startsWith('/api/v1/')) return true;

    // 3. Gateway-meta : openapi.json + info publics, le reste protégé.
    if (path.startsWith('/api/v1/api-gateway')) {
      if (LOCAL_PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return true;
      return this.authenticate(req, path);
    }

    // 4. Routes proxifiées.
    const route = matchRoute(path);
    if (!route) return true; // chemin inconnu → controller renvoie 404 normalisé
    if (isPublicEndpoint(path, route)) return true; // login, webhook USSD, etc.
    return this.authenticate(req, path);
  }

  /**
   * Valide le Bearer token et enrichit la requête (sujet + JWS interne).
   *
   * @throws HttpException(401, E_GW_004) si le token est absent ou invalide.
   */
  private authenticate(req: GatewayRequest, path: string): boolean {
    // Mode banc de test isolé : on n'exige pas de JWT (mais les en-têtes
    // d'identité ont déjà été purgés, donc aucun spoof possible).
    if (!this.authRequired) return true;

    const token = this.extractBearer(req.headers.authorization);
    if (!token) {
      throw new HttpException(
        { code: 'E_GW_004', message: 'Token JWT requis', details: { path } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    let subject: AuthSubject;
    try {
      subject = this.verifier.verifyAccess(token);
    } catch {
      // On masque le sous-cas (signature/expiration/kid) — code unique.
      this.logger.warn({ path }, 'JWT invalide refusé au gateway');
      throw new HttpException(
        { code: 'E_GW_004', message: 'Token JWT invalide', details: { path } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    req.gatewayUser = subject;
    req.userContextJws = this.signer.sign(subject);
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
