/**
 * @file        keycloak-admin.service.ts
 * @description Client Keycloak Admin REST API minimaliste.
 *
 *              Utilisé pour provisionner un utilisateur lors du flow
 *              `/auth/register/verify`. Les opérations exposées sont
 *              limitées au strict nécessaire — pas de wrapper généraliste
 *              ici (préférer un microservice dédié si le besoin croît).
 *
 *              Stratégie token : on récupère un token admin via le grant
 *              `client_credentials` au démarrage et on le cache jusqu'à
 *              expiration (avec une marge de sécurité de 30 s).
 *
 * @module      auth-service/keycloak
 */

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../config/env.config.js';

/** Réponse OIDC standard `/protocol/openid-connect/token`. */
interface OidcTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/** Représentation Keycloak d'un user (subset utilisé ici). */
export interface KeycloakUserPayload {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified: boolean;
  attributes?: Record<string, string[]>;
  credentials?: Array<{ type: 'password'; value: string; temporary: boolean }>;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /**
   * Crée un user dans le realm configuré et retourne son `sub` Keycloak.
   * Mappe automatiquement le rôle composite (`citizen` par défaut).
   *
   * @throws ServiceUnavailableException si Keycloak ne répond pas.
   * @throws InternalServerErrorException pour les erreurs métier (email déjà pris).
   */
  async createUser(input: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    phoneNumber: string;
    role: string;
  }): Promise<{ keycloakId: string }> {
    const token = await this.getAdminToken();
    const realmBase = this.realmBaseUrl();

    const payload: KeycloakUserPayload = {
      username: input.username,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      enabled: true,
      emailVerified: false,
      attributes: { phoneNumber: [input.phoneNumber] },
      credentials: [{ type: 'password', value: input.password, temporary: false }],
    };

    const createRes = await fetch(`${realmBase}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (createRes.status === 409) {
      throw new InternalServerErrorException('AUTH_USER_ALREADY_EXISTS');
    }
    if (!createRes.ok) {
      const text = await createRes.text();
      this.logger.error(`Keycloak create user KO (${createRes.status}): ${text}`);
      throw new ServiceUnavailableException('AUTH_KEYCLOAK_UNAVAILABLE');
    }

    // Keycloak renvoie l'URL du user créé dans Location ; on en extrait l'ID.
    const location = createRes.headers.get('location');
    const keycloakId = location?.split('/').pop();
    if (!keycloakId) {
      throw new InternalServerErrorException('AUTH_KEYCLOAK_INVALID_RESPONSE');
    }

    await this.assignRealmRole(token, keycloakId, input.role);
    this.logger.log(`User Keycloak créé (id=${keycloakId}, role=${input.role})`);
    return { keycloakId };
  }

  /**
   * Réinitialise le password Keycloak d'un user (flow `/auth/password/reset`).
   * Le nouveau password est posé non-temporaire — l'utilisateur n'a pas à
   * le changer au login suivant.
   */
  async resetPassword(keycloakId: string, newPassword: string): Promise<void> {
    const token = await this.getAdminToken();
    const realmBase = this.realmBaseUrl();

    const res = await fetch(`${realmBase}/users/${keycloakId}/reset-password`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'password', value: newPassword, temporary: false }),
    });

    if (res.status === 404) {
      // User Keycloak inexistant → désynchro DB/IdP. On lève en erreur
      // métier ; le caller décide si on log loud + audit (Phase 10).
      throw new InternalServerErrorException('AUTH_USER_NOT_FOUND_KEYCLOAK');
    }
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Keycloak reset-password KO (${res.status}): ${text}`);
      throw new ServiceUnavailableException('AUTH_KEYCLOAK_UNAVAILABLE');
    }
    this.logger.log(`Password Keycloak réinitialisé (id=${keycloakId})`);
  }

  // ─── interne ──────────────────────────────────────────────────────

  private async assignRealmRole(token: string, userId: string, roleName: string): Promise<void> {
    const realmBase = this.realmBaseUrl();

    const roleRes = await fetch(`${realmBase}/roles/${encodeURIComponent(roleName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!roleRes.ok) {
      this.logger.warn(`Rôle realm '${roleName}' introuvable — création utilisateur sans rôle.`);
      return;
    }
    const role = (await roleRes.json()) as { id: string; name: string };

    const assignRes = await fetch(`${realmBase}/users/${userId}/role-mappings/realm`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ id: role.id, name: role.name }]),
    });
    if (!assignRes.ok) {
      const text = await assignRes.text();
      this.logger.warn(`Échec mapping rôle '${roleName}' sur ${userId}: ${text}`);
    }
  }

  private async getAdminToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.value;
    }

    const baseUrl = this.config.get('KEYCLOAK_URL', { infer: true });
    const realm = this.config.get('KEYCLOAK_REALM', { infer: true });
    const clientId = this.config.get('KEYCLOAK_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('KEYCLOAK_CLIENT_SECRET', { infer: true });

    const url = `${baseUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Keycloak token KO (${res.status}): ${text}`);
      throw new ServiceUnavailableException('AUTH_KEYCLOAK_UNAVAILABLE');
    }
    const json = (await res.json()) as OidcTokenResponse;
    this.cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return json.access_token;
  }

  private realmBaseUrl(): string {
    const baseUrl = this.config.get('KEYCLOAK_URL', { infer: true });
    const realm = this.config.get('KEYCLOAK_REALM', { infer: true });
    return `${baseUrl.replace(/\/$/, '')}/admin/realms/${realm}`;
  }
}
