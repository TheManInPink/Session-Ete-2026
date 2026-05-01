/**
 * @file        jwks.service.ts
 * @description Récupère le document JWKS Keycloak avec mise en cache mémoire (TTL)
 *              pour éviter de surcharger l’IdP et pour exposer une URL stable côté microservices.
 * @module      auth-service
 */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Réponse JSON du endpoint `openid-connect/certs` (JWKS). */
type JwksDocument = Record<string, unknown>;

@Injectable()
export class JwksService {
  private readonly logger = new Logger(JwksService.name);

  /** Cache mémoire : corps JWKS + expiration. */
  private cache: { body: JwksDocument; expiresAt: number } | null = null;

  /** Durée de vie du cache (10 min — alignée doc JWT / rotation clés). */
  private readonly ttlMs = 600_000;

  constructor(private readonly config: ConfigService) {}

  /**
   * Retourne le JWKS Keycloak, en le réutilisant tant que le TTL n’est pas dépassé.
   *
   * @throws ServiceUnavailableException si Keycloak ne répond pas ou renvoie une erreur HTTP.
   */
  async getKeycloakJwks(): Promise<JwksDocument> {
    const now = Date.now();
    if (this.cache !== null && this.cache.expiresAt > now) {
      return this.cache.body;
    }

    const baseUrl = this.config.get<string>('KEYCLOAK_URL', 'http://localhost:8080');
    const realm = this.config.get<string>('KEYCLOAK_REALM', 'nina-aes');
    const url = `${baseUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/certs`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      this.logger.warn(`JWKS Keycloak indisponible (${response.status}) — ${url}`);
      throw new ServiceUnavailableException(
        'Impossible de récupérer les clés JWKS depuis Keycloak',
      );
    }

    const body = (await response.json()) as JwksDocument;
    this.cache = { body, expiresAt: now + this.ttlMs };
    return body;
  }
}
