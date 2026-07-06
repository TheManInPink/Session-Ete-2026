/**
 * @file        jwks-jwt.verifier.ts
 * @description Implémentation de {@link JwtVerifier} basée sur le JWKS
 *              `AUTH_JWKS_URL` (auth-service `/.well-known/jwks.json`).
 *
 *              Au boot : fetch JWKS, convertit chaque JWK en KeyObject
 *              node:crypto, stocke en Map<kid, KeyObject>.
 *
 *              À chaque vérification (synchrone par contrat JwtVerifier) :
 *                1. Décode header → kid
 *                2. Récupère la KeyObject correspondante (sinon 401)
 *                3. Vérifie signature RS256 sync via crypto.verify
 *                4. Vérifie iss/aud/exp/nbf
 *                5. Projette le payload en AuthSubject (+ claim `nina`)
 *
 *              🔒 DURCISSEMENT P1 — alignement strict sur le contrat
 *              inter-service d'auth-service / identity-service (cf. ADR-029,
 *              doc 07 §6.5bis) :
 *                - `iss` OBLIGATOIRE et égal à `AUTH_JWT_ISSUER`
 *                  (défaut souverain `nina-aes-auth`) ;
 *                - `aud` OBLIGATOIRE et CONTENANT l'identité de ce service
 *                  (`AUTH_JWT_AUDIENCE`, défaut `nina-document-service`) — seul
 *                  rempart contre la réutilisation d'un token émis pour un AUTRE
 *                  service interne partageant le même JWKS RS256 ;
 *                - `RS256` IMPLICITE et STRICT (rejet `alg=none`/HS256).
 *
 *              Le claim `nina` (NINA du citoyen propriétaire, absent pour
 *              agent/admin) est exposé sur le sujet authentifié pour alimenter
 *              le contrôle d'ownership anti-IDOR (A01) du download presigné.
 *
 *              Refresh : à chaque démarrage. En prod, rotation supportée
 *              par redémarrage rolling du service (les anciens tokens
 *              restent valides tant que leur kid est dans le JWKS courant).
 *
 * @module      document-service/auth
 */
import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';
import type { JwtVerifier } from '@nina-aes/auth-guards';
import type { Env } from '../config/env.schema';
import type { AuthSubjectWithNina } from './request-user';

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
 * Le claim `nina` (NINA du citoyen propriétaire) alimente le contrôle
 * d'ownership anti-IDOR ; il est absent pour les rôles agent/admin.
 */
interface AccessPayload {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  role?: string;
  mfa?: boolean;
  email?: string;
  nina?: string;
}

@Injectable()
export class JwksJwtVerifier implements JwtVerifier, OnModuleInit {
  private readonly log = new Logger(JwksJwtVerifier.name);
  private readonly keys = new Map<string, KeyObject>();
  private readonly url: string;

  /**
   * Émetteur attendu (`iss`) — défense contre un token d'un autre IdP.
   * 🔒 Validation OBLIGATOIRE : un token sans `iss` ou avec un `iss` différent
   * est REJETÉ. Valeur par défaut souveraine (auth-service interne).
   */
  private readonly expectedIssuer: string;

  /**
   * Audience attendue (`aud`) — vérifiée INCONDITIONNELLEMENT. Avec un JWKS
   * partagé entre services internes RS256, l'`aud` est le seul rempart contre
   * la réutilisation d'un token émis pour un AUTRE service. Un token sans `aud`
   * (ou ciblant un autre service) est donc toujours rejeté.
   */
  private readonly expectedAudience: string;

  constructor(cfg: ConfigService<Env, true>) {
    this.url = cfg.get('AUTH_JWKS_URL', { infer: true });
    this.expectedIssuer = cfg.get('AUTH_JWT_ISSUER', { infer: true });
    this.expectedAudience = cfg.get('AUTH_JWT_AUDIENCE', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    try {
      const res = await fetch(this.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const jwks = (await res.json()) as { keys: Jwk[] };
      for (const jwk of jwks.keys) {
        if (jwk.kty !== 'RSA' || !jwk.kid) continue;
        try {
          this.keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
        } catch (err) {
          this.log.warn(`JWK ${jwk.kid} ignorée : ${(err as Error).message}`);
        }
      }
      this.log.log(`JWKS chargé (${this.keys.size} clés depuis ${this.url})`);
    } catch (err) {
      // En dev, on n'empêche pas le boot — toute requête authentifiée
      // échouera avec 401, ce qui est correct (fail-closed).
      this.log.warn(
        `JWKS indisponible (${this.url}) : ${(err as Error).message} — ` +
          `les endpoints protégés répondront 401`,
      );
    }
  }

  verifyAccess(token: string): AuthSubjectWithNina {
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

    // Émetteur attendu (anti-token étranger) — OBLIGATOIRE.
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
      mfa: payload.mfa ?? false,
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      // `nina` exposé pour le contrôle d'ownership (undefined pour agent/admin).
      ...(typeof payload.nina === 'string' ? { nina: payload.nina } : {}),
    };
  }
}
