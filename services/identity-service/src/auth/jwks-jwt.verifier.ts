/**
 * @file        jwks-jwt.verifier.ts
 * @description Vérificateur d'access token RS256 basé sur le JWKS distant
 *              d'auth-service (`AUTH_JWKS_URL` → `/.well-known/jwks.json`).
 *
 *              Pattern AS-BUILT identique à appointment-service /
 *              audit-service / document-service (cf. ADR-027) : vérification
 *              cryptographique en `node:crypto` PUR, sans dépendance `jose`
 *              (non installée dans ce service). Aucune clé privée n'est
 *              manipulée ici — seules les clés PUBLIQUES du JWKS.
 *
 *              🔐 Souveraineté (ADR-029, doc 07 §6.5bis) : le JWKS provient
 *              d'auth-service INTERNE (pas d'Auth0/Cognito). RS256 est vérifié
 *              une seule fois au bord (api-gateway) ; ce vérificateur ferme le
 *              trou tant que la migration `X-User-Context` (HS256) n'est pas
 *              livrée — l'`Authorization` Bearer reste transmis (ADR-029 §1
 *              « compatibilité ascendante »).
 *
 *              Au boot : fetch JWKS → convertit chaque JWK RSA en `KeyObject`
 *              → cache `Map<kid, KeyObject>`. Un JWKS indisponible ne bloque
 *              PAS le démarrage (le /health doit répondre) : les routes
 *              protégées répondront 401 (fail-closed).
 *
 * @module      identity-service/auth
 */

import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';

import type { AuthSubject, JwtVerifier } from './auth.types';

/** Représentation minimale d'une clé JWK RSA exposée par le JWKS. */
interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
}

/**
 * Claims attendus dans l'access token émis par auth-service.
 *
 * Le claim `nina` (NINA du citoyen propriétaire) sert au
 * {@link NinaOwnershipGuard} (anti-IDOR) ; il est absent pour agent/admin.
 */
interface AccessPayload {
  sub: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  role?: string;
  mfa?: boolean;
  email?: string;
  nina?: string;
}

@Injectable()
export class JwksJwtVerifier implements JwtVerifier, OnModuleInit {
  private readonly log = new Logger(JwksJwtVerifier.name);
  private readonly keys = new Map<string, KeyObject>();

  /** URL du JWKS d'auth-service (clés publiques de signature). */
  private readonly url = process.env.AUTH_JWKS_URL ?? 'http://localhost:3002/.well-known/jwks.json';

  /**
   * Émetteur attendu (`iss`) — défense contre un token d'un autre IdP.
   * 🔒 Validation OBLIGATOIRE : un token sans `iss` ou avec un `iss` différent
   * est REJETÉ (cf. `verifyAccess`). Valeur par défaut souveraine (auth-service
   * interne), surchargeable via `AUTH_JWT_ISSUER`.
   */
  private readonly expectedIssuer = process.env.AUTH_JWT_ISSUER ?? 'nina-aes-auth';

  /**
   * Audience attendue (`aud`) — vérifiée INCONDITIONNELLEMENT.
   * 🔒 Avec un JWKS partagé entre services internes RS256, l'`aud` est le seul
   * rempart contre la réutilisation d'un token émis pour un AUTRE service. On
   * impose donc une valeur par défaut (`nina-identity-service`) afin qu'un token
   * sans `aud` (ou ciblant un autre service) soit toujours rejeté.
   */
  private readonly expectedAudience = process.env.AUTH_JWT_AUDIENCE ?? 'nina-identity-service';

  /**
   * Charge le JWKS au démarrage (best-effort : un échec ne bloque pas le boot,
   * mais les endpoints protégés renverront 401 jusqu'au prochain redémarrage).
   */
  async onModuleInit(): Promise<void> {
    try {
      const res = await fetch(this.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const jwks = (await res.json()) as { keys?: Jwk[] };
      for (const jwk of jwks.keys ?? []) {
        if (jwk.kty !== 'RSA' || !jwk.kid) continue;
        try {
          this.keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
        } catch (err) {
          this.log.warn(`JWK ${jwk.kid} ignorée : ${(err as Error).message}`);
        }
      }
      this.log.log(`JWKS chargé (${this.keys.size} clés depuis ${this.url})`);
    } catch (err) {
      this.log.warn(
        `JWKS indisponible (${this.url}) : ${(err as Error).message} — ` +
          'les endpoints protégés répondront 401 (fail-closed).',
      );
    }
  }

  /**
   * Vérifie un access token RS256 et renvoie le sujet authentifié.
   *
   * ⚠️ Contrat anti-oracle : sur tout token invalide / expiré / mal signé, on
   * lève une `UnauthorizedException` GÉNÉRIQUE (jamais de message distinguant
   * les sous-cas → empêche l'énumération d'utilisateurs / l'oracle de validité).
   *
   * `algorithms: RS256` est IMPLICITE et STRICT : on rejette `alg=none` et toute
   * confusion d'algorithme (HS256 avec la clé publique comme secret).
   *
   * @param token JWT compact (header.payload.signature), SANS préfixe `Bearer `.
   * @returns Sujet authentifié projeté en {@link AuthSubject}.
   * @throws UnauthorizedException si le token est invalide/expiré/mal signé.
   */
  verifyAccess(token: string): AuthSubject {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    const [hB64, pB64, sigB64] = parts as [string, string, string];

    let header: { kid?: string; alg?: string };
    let payload: AccessPayload;
    try {
      header = JSON.parse(Buffer.from(hB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(pB64, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }

    // ⛔ Algorithme : RS256 obligatoire, jamais `none`/HS256.
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    const key = this.keys.get(header.kid);
    if (!key) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    // Vérification cryptographique de la signature.
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${hB64}.${pB64}`);
    const ok = verifier.verify(key, Buffer.from(sigB64, 'base64url'));
    if (!ok) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    // Validité temporelle.
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > now) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }

    // Émetteur attendu (anti-token étranger) — OBLIGATOIRE : un token sans `iss`
    // ou émis par un autre IdP est rejeté (pas de court-circuit `payload.iss &&`).
    if (payload.iss !== this.expectedIssuer) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    // Audience attendue — vérifiée INCONDITIONNELLEMENT (anti-réutilisation d'un
    // token d'un autre service interne partageant le même JWKS RS256). Un token
    // sans claim `aud` ne peut donc PAS passer.
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(this.expectedAudience)) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }

    if (!payload.sub) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    return {
      userId: payload.sub,
      role: payload.role ?? 'citizen',
      mfa: payload.mfa === true,
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      // `nina` exposé pour NinaOwnershipGuard (undefined pour agent/admin).
      ...(typeof payload.nina === 'string' ? { nina: payload.nina } : {}),
    };
  }
}
