/**
 * @file        jwt.service.ts
 * @description Signature et vérification des JWT RS256 émis par auth-service.
 *
 *              Trois types de tokens, tous signés avec la même paire de clés
 *              chargée depuis Vault au boot (cf. {@link VaultService}) :
 *                - access  (TTL 15 min) — claims : sub, role, mfa, email?, kcSub?
 *                - refresh (TTL 7 j)    — claims : sub, role, jti, family
 *                - reset   (TTL 15 min) — claims : sub, purpose='password-reset', jti
 *
 *              Tous portent `iss = JWT_ISSUER`, `aud = JWT_AUDIENCE`, et un
 *              en-tête `kid` aligné sur le secret Vault — ce qui permet aux
 *              autres services (via @nina-aes/auth-guards en Phase 3) de
 *              valider la signature sans hardcoder de PEM.
 *
 *              `verify*` distingue échec de signature (jamais loggé en clair)
 *              et succès en retournant `null` vs payload typé.
 *
 * @module      auth-service/crypto
 */

import { randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

import { AUTH_ERRORS } from '../common/constants.js';
import type {
  JwtAccessPayload,
  JwtMfaChallengePayload,
  JwtRefreshPayload,
  JwtResetPayload,
  UserRole,
} from '../common/types.js';
import type { AppEnv } from '../config/env.config.js';
import { VaultService } from '../vault/vault.service.js';

/** Données minimales pour émettre un access token (claims dérivés). */
export interface SignAccessInput {
  userId: string;
  role: UserRole;
  mfa: boolean;
  email?: string;
  kcSub?: string;
}

/** Données minimales pour émettre un refresh token. */
export interface SignRefreshInput {
  userId: string;
  role: UserRole;
  /** Famille — réutilisée lors d'une rotation, créée à la première émission. */
  family?: string;
}

/** Résultat enrichi d'un signRefresh — la famille et le jti sont nécessaires en Redis. */
export interface SignedRefresh {
  token: string;
  jti: string;
  family: string;
  expiresAt: number;
}

/** Données minimales pour émettre un reset token. */
export interface SignResetInput {
  userId: string;
}

/** Données minimales pour émettre un challenge MFA. */
export interface SignMfaChallengeInput {
  userId: string;
  role: UserRole;
  kcSub: string;
}

@Injectable()
export class JwtCryptoService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly resetTtl: number;

  constructor(
    private readonly vault: VaultService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    this.audience = config.get('JWT_AUDIENCE', { infer: true });
    this.accessTtl = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    this.refreshTtl = config.get('JWT_REFRESH_TTL_SECONDS', { infer: true });
    this.resetTtl = config.get('JWT_RESET_TTL_SECONDS', { infer: true });
  }

  // ─── Signatures ───────────────────────────────────────────────────

  /** Émet un access token RS256 (TTL 15 min). */
  signAccess(input: SignAccessInput): string {
    const { kid, privatePem } = this.vault.getJwtKeys();
    const payload: Pick<JwtAccessPayload, 'sub' | 'role' | 'mfa' | 'email' | 'kcSub'> = {
      sub: input.userId,
      role: input.role,
      mfa: input.mfa,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.kcSub !== undefined ? { kcSub: input.kcSub } : {}),
    };
    return jwt.sign(payload, privatePem, {
      algorithm: 'RS256',
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.accessTtl,
      keyid: kid,
    });
  }

  /**
   * Émet un refresh token RS256 (TTL 7 j) + retourne `jti`/`family` pour
   * permettre l'enregistrement Redis (détection de rejeu).
   */
  signRefresh(input: SignRefreshInput): SignedRefresh {
    const { kid, privatePem } = this.vault.getJwtKeys();
    const jti = randomUUID();
    const family = input.family ?? randomUUID();
    const payload: Pick<JwtRefreshPayload, 'sub' | 'role' | 'jti' | 'family'> = {
      sub: input.userId,
      role: input.role,
      jti,
      family,
    };
    const token = jwt.sign(payload, privatePem, {
      algorithm: 'RS256',
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.refreshTtl,
      keyid: kid,
    });
    return { token, jti, family, expiresAt: Date.now() + this.refreshTtl * 1000 };
  }

  /**
   * Émet un challenge MFA RS256 (TTL = JWT_RESET_TTL_SECONDS, par défaut 5 min).
   * Le `jti` doit être consommé une seule fois côté MfaService (Redis).
   */
  signMfaChallenge(input: SignMfaChallengeInput): {
    token: string;
    jti: string;
    expiresAt: number;
  } {
    const { kid, privatePem } = this.vault.getJwtKeys();
    const jti = randomUUID();
    const payload: Pick<JwtMfaChallengePayload, 'sub' | 'purpose' | 'jti' | 'role' | 'kcSub'> = {
      sub: input.userId,
      purpose: 'mfa-challenge',
      jti,
      role: input.role,
      kcSub: input.kcSub,
    };
    // On réutilise volontairement le même TTL que le reset (5 min) — la
    // durée est cohérente avec la fenêtre raisonnable d'une saisie MFA.
    const token = jwt.sign(payload, privatePem, {
      algorithm: 'RS256',
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.resetTtl,
      keyid: kid,
    });
    return { token, jti, expiresAt: Date.now() + this.resetTtl * 1000 };
  }

  /** Vérifie un challenge MFA. Lance `UnauthorizedException` si invalide. */
  verifyMfaChallenge(token: string): JwtMfaChallengePayload {
    const decoded = this.verify<JwtMfaChallengePayload>(token);
    if (decoded.purpose !== 'mfa-challenge' || !decoded.jti) {
      throw new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
    }
    return decoded;
  }

  /** Émet un reset password token RS256 (TTL 15 min, usage unique via jti Redis). */
  signReset(input: SignResetInput): { token: string; jti: string; expiresAt: number } {
    const { kid, privatePem } = this.vault.getJwtKeys();
    const jti = randomUUID();
    const payload: Pick<JwtResetPayload, 'sub' | 'purpose' | 'jti'> = {
      sub: input.userId,
      purpose: 'password-reset',
      jti,
    };
    const token = jwt.sign(payload, privatePem, {
      algorithm: 'RS256',
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.resetTtl,
      keyid: kid,
    });
    return { token, jti, expiresAt: Date.now() + this.resetTtl * 1000 };
  }

  // ─── Vérifications ────────────────────────────────────────────────

  /** Vérifie un access token. Lance `UnauthorizedException` en cas d'échec. */
  verifyAccess(token: string): JwtAccessPayload {
    return this.verify<JwtAccessPayload>(token);
  }

  /** Vérifie un refresh token. Lance `UnauthorizedException` en cas d'échec. */
  verifyRefresh(token: string): JwtRefreshPayload {
    const decoded = this.verify<JwtRefreshPayload>(token);
    if (!decoded.jti || !decoded.family) {
      throw new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
    }
    return decoded;
  }

  /** Vérifie un reset token. Lance `UnauthorizedException` si invalide ou mauvaise `purpose`. */
  verifyReset(token: string): JwtResetPayload {
    const decoded = this.verify<JwtResetPayload>(token);
    if (decoded.purpose !== 'password-reset' || !decoded.jti) {
      throw new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
    }
    return decoded;
  }

  /**
   * Décode sans vérifier la signature — utilisé uniquement pour des cas
   * non-sécurité (lecture de `kid` côté JWKS proxy par ex.). Ne JAMAIS
   * appeler depuis un chemin d'auth.
   */
  decodeUnsafe(token: string): unknown {
    return jwt.decode(token);
  }

  // ─── interne ──────────────────────────────────────────────────────

  private verify<T extends jwt.JwtPayload>(token: string): T {
    const { publicPem } = this.vault.getJwtKeys();
    try {
      return jwt.verify(token, publicPem, {
        algorithms: ['RS256'],
        issuer: this.issuer,
        audience: this.audience,
      }) as T;
    } catch {
      throw new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
    }
  }
}
