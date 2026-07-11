/**
 * @file        keycloak-token.verifier.ts
 * @description Vérifie un access token **Keycloak** (RS256) présenté au flux
 *              d'échange SSO citoyen (`POST /auth/sso/exchange`, cf. ADR-036).
 *
 *              Contrôles — tous *fail-closed* (message client uniforme) :
 *                1. Signature RS256 contre le JWKS Keycloak (clé résolue par
 *                   `kid`). `algorithms:['RS256']` bloque toute confusion
 *                   d'algorithme (`none` / HS256 avec la clé publique en secret).
 *                2. `iss` = émetteur attendu (celui VU PAR LE NAVIGATEUR —
 *                   `KEYCLOAK_ISSUER`, sinon dérivé de `KEYCLOAK_URL`/`REALM`).
 *                3. `azp` = client du portail citoyen (`KEYCLOAK_SSO_CLIENT_ID`)
 *                   → scope l'échange au seul portail citoyen.
 *                4. `typ` ≠ `ID`/`Refresh` → refuse un id/refresh token.
 *                5. `exp` / `nbf` (jsonwebtoken, tolérance d'horloge 5 s).
 *
 *              ⚠️ On ne fait CONFIANCE à AUCUN claim d'identité applicative du
 *              token (rôle, nina) : seul `sub` (le `kcSub` Keycloak) est extrait,
 *              puis re-résolu en base côté {@link AuthService} (le rôle vient
 *              TOUJOURS de la DB). Le JWKS est récupéré via `KEYCLOAK_URL` (URL
 *              interne) — volontairement indépendant de l'`iss` du token pour
 *              gérer le « split-horizon » (navigateur vs réseau du service).
 *
 * @module      auth-service/keycloak
 */

import { createPublicKey, type KeyObject } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import type { JwtHeader, JwtPayload } from 'jsonwebtoken';

import { AUTH_ERRORS } from '../common/constants.js';
import type { AppEnv } from '../config/env.config.js';
import { JwksService, type RsaPublicJwk } from '../jwks/jwks.service.js';

/** Claims minimaux de confiance extraits d'un token Keycloak vérifié. */
export interface VerifiedKeycloakClaims {
  /** `sub` Keycloak = `keycloakId` côté DB (seule donnée de confiance). */
  sub: string;
}

@Injectable()
export class KeycloakTokenVerifier {
  private readonly logger = new Logger(KeycloakTokenVerifier.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly jwks: JwksService,
  ) {}

  /**
   * Vérifie un access token Keycloak et renvoie ses claims de confiance.
   *
   * @throws UnauthorizedException — message uniforme `AUTH_TOKEN_INVALID` sur
   *         TOUT échec (signature, issuer, azp, type, expiration, clé absente),
   *         la raison précise n'étant journalisée que côté serveur (anti-oracle).
   */
  async verify(token: string): Promise<VerifiedKeycloakClaims> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw this.reject('token illisible');
    }
    const header = decoded.header as JwtHeader;
    if (header.alg !== 'RS256' || !header.kid) {
      throw this.reject(`en-tête invalide (alg=${header.alg}, kid=${header.kid ?? '∅'})`);
    }

    const key = await this.resolveKey(header.kid);
    const expectedIssuer = this.expectedIssuer();
    const expectedAzp = this.config.get('KEYCLOAK_SSO_CLIENT_ID', { infer: true });

    let payload: JwtPayload;
    try {
      const verified = jwt.verify(token, key, {
        algorithms: ['RS256'],
        issuer: expectedIssuer,
        clockTolerance: 5,
      });
      if (typeof verified === 'string') throw new Error('payload scalaire inattendu');
      payload = verified;
    } catch (err) {
      throw this.reject(`vérification échouée : ${(err as Error).message}`);
    }

    // Scope au portail citoyen : le token doit avoir été émis POUR ce client.
    if (payload.azp !== expectedAzp) {
      throw this.reject(`azp inattendu (${String(payload.azp)} ≠ ${expectedAzp})`);
    }
    // Refuse explicitement un id/refresh token (un access token Keycloak porte
    // `typ: 'Bearer'`). Un `typ` absent reste toléré (défense en profondeur :
    // la signature + `azp` restent les contrôles primaires).
    const typ = (payload as { typ?: unknown }).typ;
    if (typeof typ === 'string' && typ !== 'Bearer') {
      throw this.reject(`type de token non-access (typ=${typ})`);
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw this.reject('sub absent');
    }

    return { sub: payload.sub };
  }

  /** Émetteur attendu : override explicite (`KEYCLOAK_ISSUER`) ou dérivé. */
  private expectedIssuer(): string {
    const override = this.config.get('KEYCLOAK_ISSUER', { infer: true });
    if (override) return override.replace(/\/$/, '');
    const base = this.config.get('KEYCLOAK_URL', { infer: true }).replace(/\/$/, '');
    const realm = this.config.get('KEYCLOAK_REALM', { infer: true });
    return `${base}/realms/${realm}`;
  }

  /** Résout la clé publique RSA correspondant au `kid` dans le JWKS Keycloak. */
  private async resolveKey(kid: string): Promise<KeyObject> {
    const doc = (await this.jwks.getKeycloakJwks()) as { keys?: unknown };
    const keys = Array.isArray(doc.keys) ? (doc.keys as RsaPublicJwk[]) : [];
    const jwk = keys.find((k) => k?.kid === kid && k?.kty === 'RSA');
    if (!jwk) {
      throw this.reject(`aucune clé JWKS Keycloak pour kid=${kid}`);
    }
    try {
      return createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
    } catch (err) {
      throw this.reject(`clé JWKS non importable : ${(err as Error).message}`);
    }
  }

  /** Journalise la raison précise côté serveur, renvoie un 401 uniforme. */
  private reject(reason: string): UnauthorizedException {
    this.logger.warn(`SSO exchange — token Keycloak rejeté : ${reason}`);
    return new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
  }
}
