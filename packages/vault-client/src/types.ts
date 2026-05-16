/**
 * @file        types.ts
 * @description Types partagés pour le client Vault NINA-AES.
 * @module      @nina-aes/vault-client
 */

/**
 * Configuration du client Vault. Toutes les valeurs peuvent être
 * surchargées via variables d'environnement (cf. {@link envConfig}).
 */
export interface VaultClientConfig {
  /** URL Vault complète (ex. `http://vault:8200`). */
  endpoint: string;

  /** Stratégie d'authentification au démarrage. */
  auth:
    | { method: 'token'; token: string }
    | { method: 'approle'; roleId: string; secretId: string }
    | { method: 'kubernetes'; role: string; jwtPath?: string };

  /** TTL du cache mémoire pour chaque secret (défaut : 5 min). */
  cacheTtlSeconds?: number;

  /**
   * Si true, le client renouvelle son propre token automatiquement
   * avant son expiration (défaut : true).
   */
  autoRenew?: boolean;

  /** Préfixe optionnel des paths kv-v2 (défaut : `kv/data/`). */
  kvMountPath?: string;

  /** Timeout HTTP en millisecondes (défaut : 5000). */
  requestTimeoutMs?: number;

  /**
   * Niveau de log (none | error | warn | info | debug). Par défaut
   * lu depuis `LOG_LEVEL` ou `info`. Émet vers `console.*`.
   */
  logLevel?: 'none' | 'error' | 'warn' | 'info' | 'debug';
}

/** Entrée du cache mémoire avec horodatage d'expiration. */
export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number; // epoch ms
}

/**
 * Résultat d'une requête `database/creds/<role>` — credentials
 * Postgres dynamiques générées par Vault, valides pendant `leaseTtl`.
 */
export interface DatabaseCredentials {
  username: string;
  password: string;
  leaseId: string;
  leaseTtl: number; // secondes
  renewable: boolean;
}

/**
 * Résultat d'une signature Transit (`transit/sign/<key>`).
 * La signature est en format base64 préfixé `vault:vN:...`.
 */
export interface TransitSignature {
  signature: string;
  keyVersion: number;
}

/** Niveau de log accepté. */
export type LogLevel = NonNullable<VaultClientConfig['logLevel']>;
