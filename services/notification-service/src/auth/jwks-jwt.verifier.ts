/**
 * @file        jwks-jwt.verifier.ts
 * @description Implémentation de {@link JwtVerifier} basée sur le JWKS distant
 *              d'auth-service (`AUTH_JWKS_URL` → `/.well-known/jwks.json`).
 *
 *              Au boot : fetch JWKS → convertit chaque JWK RSA en KeyObject
 *              `node:crypto` → cache en Map<kid, KeyObject>.
 *
 *              À chaque vérification (synchrone, conforme au contrat
 *              `JwtVerifier`) : décode header→kid, vérifie RS256, exp/nbf/sub,
 *              projette en `AuthSubject`. Aucune clé privée ici (ADR-027,
 *              pattern identique à audit-service et document-service).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/auth
 */
import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';
import type { AuthSubject, JwtVerifier } from '@nina-aes/auth-guards';
import type { Env } from '../config/env.schema.js';

/** Représentation minimale d'une clé JWK RSA. */
interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  use?: string;
}

/** Claims attendus dans l'access token. */
interface AccessPayload {
  sub: string;
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

  /** Charge le JWKS au démarrage (best-effort : un échec ne bloque pas le boot). */
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
      this.log.warn(
        `JWKS indisponible (${this.url}) : ${(err as Error).message} — ` +
          'les endpoints protégés répondront 401.',
      );
    }
  }

  /**
   * Vérifie un access token RS256 et renvoie le sujet authentifié.
   *
   * @param token JWT compact (sans préfixe `Bearer `).
   * @returns Sujet authentifié projeté en `AuthSubject`.
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
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    };
  }
}
