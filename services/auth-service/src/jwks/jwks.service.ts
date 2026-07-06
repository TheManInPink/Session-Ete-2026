/**
 * @file        jwks.service.ts
 * @description Construit le document JWKS exposé par auth-service.
 *
 *              ⚠️ CONTRAT INTER-SERVICE (corrige un drift majeur, doc 08 §0) :
 *              `/.well-known/jwks.json` DOIT exposer la clé PUBLIQUE de
 *              SIGNATURE d'auth-service (celle dont la privée — chargée depuis
 *              Vault — signe les access/refresh RS256), pas le JWKS Keycloak.
 *              Les vérificateurs aval (`identity-service`, `api-gateway`, …)
 *              fetchent CET endpoint pour valider la signature des tokens NINA.
 *              Servir le JWKS Keycloak ici casserait toute vérification (les
 *              tokens ne sont PAS signés par Keycloak — cf. doc 08 §0 écart 1).
 *
 *              La clé publique PEM (Vault) est convertie en JWK RSA via
 *              `node:crypto` (`createPublicKey(...).export({ format: 'jwk' })`)
 *              et estampillée du `kid` Vault — le même que l'en-tête `kid` des
 *              tokens émis, garantissant la cohérence de sélection côté aval.
 *
 *              Le proxy JWKS Keycloak historique reste disponible
 *              ({@link getKeycloakJwks}) pour les usages SSO/OIDC éventuels,
 *              mais n'est PLUS servi sur `/.well-known/jwks.json`.
 *
 * @module      auth-service
 */

import { createPublicKey } from 'node:crypto';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { VaultService } from '../vault/vault.service.js';

/** Réponse JSON du endpoint `openid-connect/certs` (JWKS). */
type JwksDocument = Record<string, unknown>;

/** Une entrée JWK RSA publique (clé de vérification de signature). */
export interface RsaPublicJwk extends Record<string, unknown> {
  kty: 'RSA';
  n: string;
  e: string;
  alg: 'RS256';
  use: 'sig';
  kid: string;
}

/** Document JWKS standard (RFC 7517). */
export interface Jwks {
  keys: RsaPublicJwk[];
}

@Injectable()
export class JwksService {
  private readonly logger = new Logger(JwksService.name);

  /** Cache mémoire du JWKS Keycloak (proxy SSO) : corps + expiration. */
  private cache: { body: JwksDocument; expiresAt: number } | null = null;

  /** Durée de vie du cache Keycloak (10 min — alignée doc JWT / rotation clés). */
  private readonly ttlMs = 600_000;

  constructor(
    private readonly config: ConfigService,
    private readonly vault: VaultService,
  ) {}

  /**
   * Retourne le JWKS de SIGNATURE d'auth-service (clé publique Vault → JWK).
   *
   * C'est le document servi sur `/.well-known/jwks.json` et consommé par tous
   * les vérificateurs aval. Le `kid` exposé est EXACTEMENT celui gravé dans
   * l'en-tête des tokens (cf. {@link JwtCryptoService}).
   *
   * @throws ServiceUnavailableException si les clés ne sont pas encore chargées
   *         (boot Vault non terminé) ou si l'export JWK échoue.
   */
  getSigningJwks(): Jwks {
    const { publicPem, kid } = this.vault.getJwtKeys();

    let jwk: JsonWebKey;
    try {
      jwk = createPublicKey({ key: publicPem, format: 'pem' }).export({ format: 'jwk' });
    } catch (err) {
      this.logger.error(`Export JWK de la clé publique échoué : ${(err as Error).message}`);
      throw new ServiceUnavailableException('JWKS de signature indisponible');
    }

    if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') {
      this.logger.error('Clé publique Vault non-RSA — JWKS de signature impossible à construire.');
      throw new ServiceUnavailableException('JWKS de signature indisponible');
    }

    return {
      keys: [
        {
          kty: 'RSA',
          n: jwk.n,
          e: jwk.e,
          alg: 'RS256',
          use: 'sig',
          kid,
        },
      ],
    };
  }

  /**
   * Retourne le JWKS Keycloak (proxy SSO/OIDC), en le réutilisant tant que le
   * TTL n'est pas dépassé.
   *
   * ⚠️ N'est PLUS servi sur `/.well-known/jwks.json` (cf. en-tête de fichier) —
   * conservé pour des besoins SSO/OIDC éventuels.
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
