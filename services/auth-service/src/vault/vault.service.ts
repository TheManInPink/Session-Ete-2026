/**
 * @file        vault.service.ts
 * @description Couche d'abstraction Vault pour le auth-service.
 *
 *              Au boot :
 *                1. Instancie `VaultClient` à partir des variables d'environnement.
 *                2. Login (token / approle / kubernetes).
 *                3. Charge la paire de clés RS256 depuis `VAULT_JWT_KEYS_PATH`
 *                   (KV v2). Le secret DOIT contenir au moins :
 *                     { private_pem, public_pem, kid }
 *                   — aucun fallback fichier n'est toléré (décision PROMPT 3.2
 *                   confirmée par l'utilisateur : « Vault strict »).
 *
 *              Expose les PEMs aux services qui en ont besoin (JwtCryptoService)
 *              sans laisser fuiter les internes du client Vault.
 *
 * @module      auth-service/vault
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultClient } from '@nina-aes/vault-client';

import type { AppEnv } from '../config/env.config.js';

/** Shape attendue du secret JWT stocké dans Vault (KV v2). */
interface JwtKeysSecret extends Record<string, unknown> {
  private_pem: string;
  public_pem: string;
  kid: string;
}

/** Paire de clés chargée en mémoire après le boot. */
export interface JwtKeyMaterial {
  privatePem: string;
  publicPem: string;
  kid: string;
}

@Injectable()
export class VaultService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultService.name);
  private client: VaultClient | null = null;
  private keys: JwtKeyMaterial | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  /**
   * Boot complet — invoqué automatiquement par Nest. Tout échec (auth, secret
   * manquant, shape invalide) interrompt le démarrage du service.
   */
  async onModuleInit(): Promise<void> {
    const endpoint = this.config.get('VAULT_ADDR', { infer: true });
    const method = this.config.get('VAULT_AUTH_METHOD', { infer: true });

    this.client = new VaultClient({
      endpoint,
      auth: this.buildAuthConfig(method),
      logLevel: this.config.get('LOG_LEVEL', { infer: true }),
    });

    await this.client.login();
    this.logger.log(`Vault auth OK (méthode=${method})`);

    await this.loadJwtKeys();
  }

  /** Termine proprement le client Vault (annule le timer de renouvellement). */
  onModuleDestroy(): void {
    this.client?.destroy();
    this.client = null;
    this.keys = null;
  }

  /**
   * Retourne le matériel cryptographique JWT chargé au boot.
   * @throws ServiceUnavailableException si la paire n'est pas (encore) initialisée.
   */
  getJwtKeys(): JwtKeyMaterial {
    if (!this.keys) {
      throw new ServiceUnavailableException('Clés JWT non initialisées');
    }
    return this.keys;
  }

  /**
   * Accès brut au client Vault (pour les modules qui ont besoin de Transit,
   * de credentials Postgres dynamiques, etc.). Préférer des helpers ciblés
   * sur ce service plutôt que d'utiliser cette méthode directement.
   */
  getClient(): VaultClient {
    if (!this.client) {
      throw new ServiceUnavailableException('Client Vault non initialisé');
    }
    return this.client;
  }

  // ─── interne ─────────────────────────────────────────────────────

  private buildAuthConfig(
    method: AppEnv['VAULT_AUTH_METHOD'],
  ): ConstructorParameters<typeof VaultClient>[0]['auth'] {
    if (method === 'token') {
      const token = this.config.get('VAULT_TOKEN', { infer: true });
      if (!token) throw new Error('VAULT_AUTH_METHOD=token nécessite VAULT_TOKEN');
      return { method: 'token', token };
    }
    if (method === 'approle') {
      const roleId = this.config.get('VAULT_APPROLE_ROLE_ID', { infer: true });
      const secretId = this.config.get('VAULT_APPROLE_SECRET_ID', { infer: true });
      if (!roleId || !secretId) {
        throw new Error(
          'VAULT_AUTH_METHOD=approle nécessite VAULT_APPROLE_ROLE_ID et VAULT_APPROLE_SECRET_ID',
        );
      }
      return { method: 'approle', roleId, secretId };
    }
    const role = this.config.get('VAULT_KUBERNETES_ROLE', { infer: true });
    if (!role) throw new Error('VAULT_AUTH_METHOD=kubernetes nécessite VAULT_KUBERNETES_ROLE');
    return { method: 'kubernetes', role };
  }

  private async loadJwtKeys(): Promise<void> {
    const path = this.normalizeKvPath(this.config.get('VAULT_JWT_KEYS_PATH', { infer: true }));
    const secret = await this.client!.getSecret<JwtKeysSecret>(path);

    if (!secret.private_pem || !secret.public_pem || !secret.kid) {
      throw new Error(
        `Secret Vault '${path}' invalide : champs requis private_pem / public_pem / kid manquants.`,
      );
    }
    if (!secret.private_pem.includes('PRIVATE KEY') || !secret.public_pem.includes('PUBLIC KEY')) {
      throw new Error(
        `Secret Vault '${path}' : private_pem/public_pem ne ressemblent pas à des PEMs valides.`,
      );
    }

    this.keys = {
      privatePem: secret.private_pem,
      publicPem: secret.public_pem,
      kid: secret.kid,
    };
    this.logger.log(`Clés JWT chargées depuis Vault (kid=${secret.kid}, path=${path})`);
  }

  /**
   * Normalise le path KV : VaultClient préfixe `kv/data/` lui-même, donc on
   * accepte aussi bien `kv/data/auth/jwt` (legacy) que `auth/jwt` (recommandé).
   */
  private normalizeKvPath(raw: string): string {
    return raw.replace(/^kv\/data\//, '').replace(/^\//, '');
  }
}
