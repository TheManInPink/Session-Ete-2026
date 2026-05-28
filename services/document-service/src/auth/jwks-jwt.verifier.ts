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
 *                5. Projette le payload en AuthSubject
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
import type { AuthSubject, JwtVerifier } from '@nina-aes/auth-guards';
import type { Env } from '../config/env.schema';

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
}

interface AccessPayload {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  role?: string;
  mfa?: boolean;
  email?: string;
}

@Injectable()
export class JwksJwtVerifier implements JwtVerifier, OnModuleInit {
  private readonly log = new Logger(JwksJwtVerifier.name);
  private readonly keys = new Map<string, KeyObject>();
  private readonly url: string;

  constructor(cfg: ConfigService<Env, true>) {
    this.url = cfg.get('AUTH_JWKS_URL', { infer: true });
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
      // échouera avec 401, ce qui est correct.
      this.log.warn(
        `JWKS indisponible (${this.url}) : ${(err as Error).message} — ` +
          `les endpoints protégés répondront 401`,
      );
    }
  }

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

    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    const key = this.keys.get(header.kid);
    if (!key) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${hB64}.${pB64}`);
    const ok = verifier.verify(key, Buffer.from(sigB64, 'base64url'));
    if (!ok) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > now) {
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
    if (!payload.sub) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    return {
      userId: payload.sub,
      role: payload.role ?? 'citizen',
      mfa: payload.mfa ?? false,
      email: payload.email,
    };
  }
}
