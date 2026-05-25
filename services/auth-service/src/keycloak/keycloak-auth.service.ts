/**
 * @file        keycloak-auth.service.ts
 * @description Validation des credentials utilisateur via le grant
 *              `password` du Resource Owner Password Credentials Flow.
 *
 *              ⚠️ Ce grant est déprécié par OAuth 2.1 mais reste autorisé
 *              côté Keycloak pour des intégrations server-to-server où
 *              l'IdP est interne. Ici, le client `nina-aes-platform`
 *              (confidentiel, client_secret) sert d'intermédiaire et
 *              n'expose JAMAIS le password au navigateur — celui-ci
 *              transite uniquement entre auth-service et Keycloak via
 *              le réseau privé.
 *
 *              On n'utilise le token Keycloak QUE pour confirmer que le
 *              password est correct + lire le `sub` Keycloak. Les tokens
 *              applicatifs (access/refresh) sont émis par
 *              {@link JwtCryptoService} avec les clés Vault.
 *
 * @module      auth-service/keycloak
 */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUTH_ERRORS } from '../common/constants.js';
import type { AppEnv } from '../config/env.config.js';

/** Réponse du token endpoint OIDC (subset utilisé). */
interface OidcTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

/** Résultat positif d'une validation password. */
export interface KeycloakAuthResult {
  /** `sub` Keycloak (= `keycloakId` côté DB). */
  keycloakSub: string;
}

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new Logger(KeycloakAuthService.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /**
   * Valide un couple (username|email, password) auprès de Keycloak.
   *
   * @returns Le `keycloakSub` si le password est correct.
   * @throws Error(AUTH_INVALID_CREDENTIALS) en cas de 401/400.
   * @throws ServiceUnavailableException si Keycloak ne répond pas.
   */
  async validatePassword(identifier: string, password: string): Promise<KeycloakAuthResult> {
    const baseUrl = this.config.get('KEYCLOAK_URL', { infer: true });
    const realm = this.config.get('KEYCLOAK_REALM', { infer: true });
    const clientId = this.config.get('KEYCLOAK_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('KEYCLOAK_CLIENT_SECRET', { infer: true });

    const url = `${baseUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: identifier,
      password,
      scope: 'openid',
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (res.status === 401 || res.status === 400) {
      // Pas de log de body → n'expose pas l'existence du compte.
      throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS);
    }
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Keycloak password grant KO (${res.status}): ${text}`);
      throw new ServiceUnavailableException('AUTH_KEYCLOAK_UNAVAILABLE');
    }

    const json = (await res.json()) as OidcTokenResponse;
    const claims = this.decodeJwtClaims(json.access_token);
    const sub = claims['sub'];
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new ServiceUnavailableException('AUTH_KEYCLOAK_INVALID_RESPONSE');
    }
    return { keycloakSub: sub };
  }

  /**
   * Décode (sans vérifier) les claims d'un JWT Keycloak — usage interne
   * uniquement pour lire le `sub`. La validité a déjà été établie par le
   * fait que Keycloak l'a émis en réponse à 200.
   */
  private decodeJwtClaims(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return {};
    try {
      const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
