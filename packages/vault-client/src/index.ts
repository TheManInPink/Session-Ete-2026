/**
 * @file        index.ts
 * @description Client TypeScript pour HashiCorp Vault (NINA-AES Platform).
 *
 *              Fonctionnalités :
 *                - Authentification AppRole / Token / Kubernetes
 *                - Fetch et cache mémoire des secrets (TTL configurable)
 *                - Auto-renew du token avant expiration
 *                - Helpers : getSecret, getDatabaseCreds, sign/verify Transit
 *                - Rotation de clé Transit (admin only)
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/vault-client
 */

import type {
  VaultClientConfig,
  CacheEntry,
  DatabaseCredentials,
  TransitSignature,
  LogLevel,
} from './types.js';

const LOG_LEVELS: Record<LogLevel, number> = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Client Vault de haut niveau pour les services NestJS NINA-AES.
 *
 * Usage type (NestJS) :
 *   const vault = new VaultClient({
 *     endpoint: process.env.VAULT_ADDR!,
 *     auth: { method: 'approle', roleId: ..., secretId: ... },
 *   });
 *   await vault.login();
 *   const { url } = await vault.getSecret<{ url: string }>('database/identity-service');
 */
export class VaultClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private renewTimer: NodeJS.Timeout | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly cfg: VaultClientConfig) {
    this.cfg.cacheTtlSeconds ??= 300; // 5 min
    this.cfg.autoRenew ??= true;
    this.cfg.kvMountPath ??= 'kv/data/';
    this.cfg.requestTimeoutMs ??= 5_000;
    this.cfg.logLevel ??= (process.env.LOG_LEVEL as LogLevel) ?? 'info';
  }

  // ─── Logging interne minimal ───────────────────────────────────
  private log(level: LogLevel, msg: string, meta?: unknown): void {
    if (LOG_LEVELS[level] > LOG_LEVELS[this.cfg.logLevel!]) return;
    const prefix = `[vault-client] [${level.toUpperCase()}]`;
    console[level === 'error' || level === 'warn' ? level : 'log'](prefix, msg, meta ?? '');
  }

  // ─── Login (authentification) ─────────────────────────────────
  /**
   * Authentifie le client selon la méthode configurée. À appeler
   * une fois au démarrage du service. Démarre le renouvellement
   * automatique du token si `autoRenew` est activé.
   *
   * @throws Si Vault refuse l'authentification (401/403).
   */
  async login(): Promise<void> {
    const { auth } = this.cfg;
    if (auth.method === 'token') {
      this.token = auth.token;
      // Lookup pour récupérer le TTL réel
      const data = await this.request<{ data: { ttl: number } }>('GET', 'auth/token/lookup-self');
      this.tokenExpiresAt = Date.now() + (data.data.ttl || 3600) * 1000;
      this.log('info', `Auth token OK, TTL=${data.data.ttl}s`);
    } else if (auth.method === 'approle') {
      const body = { role_id: auth.roleId, secret_id: auth.secretId };
      const res = await this.request<{ auth: { client_token: string; lease_duration: number } }>(
        'POST',
        'auth/approle/login',
        body,
        /* skipAuth */ true,
      );
      this.token = res.auth.client_token;
      this.tokenExpiresAt = Date.now() + res.auth.lease_duration * 1000;
      this.log('info', `Auth AppRole OK, TTL=${res.auth.lease_duration}s`);
    } else if (auth.method === 'kubernetes') {
      const fs = await import('node:fs/promises');
      const jwt = await fs.readFile(
        auth.jwtPath ?? '/var/run/secrets/kubernetes.io/serviceaccount/token',
        'utf8',
      );
      const res = await this.request<{ auth: { client_token: string; lease_duration: number } }>(
        'POST',
        'auth/kubernetes/login',
        { role: auth.role, jwt: jwt.trim() },
        true,
      );
      this.token = res.auth.client_token;
      this.tokenExpiresAt = Date.now() + res.auth.lease_duration * 1000;
      this.log('info', `Auth Kubernetes OK, TTL=${res.auth.lease_duration}s`);
    }

    if (this.cfg.autoRenew) this.scheduleRenew();
  }

  /** Programme un renouvellement à 80 % du TTL restant. */
  private scheduleRenew(): void {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    const remaining = this.tokenExpiresAt - Date.now();
    if (remaining <= 0) return;
    const renewIn = Math.max(remaining * 0.8, 30_000); // au moins 30s
    this.renewTimer = setTimeout(async () => {
      try {
        const res = await this.request<{ auth: { lease_duration: number } }>(
          'POST',
          'auth/token/renew-self',
        );
        this.tokenExpiresAt = Date.now() + res.auth.lease_duration * 1000;
        this.log('info', `Token renouvelé, nouveau TTL=${res.auth.lease_duration}s`);
        this.scheduleRenew();
      } catch (err) {
        this.log('error', 'Renouvellement token échoué — re-login requis', err);
      }
    }, renewIn);
    this.renewTimer.unref?.();
  }

  // ─── Méthodes publiques ────────────────────────────────────────
  /**
   * Récupère un secret depuis l'engine kv-v2, avec cache mémoire TTL.
   *
   * @param path - Chemin RELATIF au mount kv (ex. `database/identity-service`)
   * @returns L'objet `data` du secret typé selon `T`.
   */
  async getSecret<T extends Record<string, unknown> = Record<string, unknown>>(
    path: string,
  ): Promise<T> {
    const cacheKey = `kv:${path}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.log('debug', `Cache hit ${cacheKey}`);
      return cached.value as T;
    }

    const url = `${this.cfg.kvMountPath}${path}`.replace(/\/+/g, '/');
    const res = await this.request<{ data: { data: T } }>('GET', url);
    const value = res.data.data;
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.cfg.cacheTtlSeconds! * 1000,
    });
    return value;
  }

  /**
   * Récupère des credentials Postgres dynamiques (engine `database`).
   * Les credentials sont valides pendant `leaseTtl` secondes et
   * révoquées automatiquement par Vault à expiration.
   */
  async getDatabaseCreds(role: string): Promise<DatabaseCredentials> {
    const res = await this.request<{
      lease_id: string;
      lease_duration: number;
      renewable: boolean;
      data: { username: string; password: string };
    }>('GET', `database/creds/${role}`);
    return {
      username: res.data.username,
      password: res.data.password,
      leaseId: res.lease_id,
      leaseTtl: res.lease_duration,
      renewable: res.renewable,
    };
  }

  /**
   * Signe un payload avec une clé du Transit engine. La clé privée
   * NE QUITTE JAMAIS Vault. La signature retournée est au format
   * `vault:vN:<base64>`.
   */
  async transitSign(keyName: string, payloadBase64: string): Promise<TransitSignature> {
    const res = await this.request<{ data: { signature: string; key_version: number } }>(
      'POST',
      `transit/sign/${keyName}`,
      { input: payloadBase64 },
    );
    return { signature: res.data.signature, keyVersion: res.data.key_version };
  }

  /** Vérifie une signature Transit. */
  async transitVerify(keyName: string, payloadBase64: string, signature: string): Promise<boolean> {
    const res = await this.request<{ data: { valid: boolean } }>(
      'POST',
      `transit/verify/${keyName}`,
      { input: payloadBase64, signature },
    );
    return res.data.valid;
  }

  /**
   * Chiffre un payload avec une clé Transit. Le ciphertext retourné est
   * au format `vault:vN:<base64>` et inclut la version de clé utilisée —
   * il est auto-suffisant pour le déchiffrement même après rotation.
   *
   * @param keyName       Nom de la clé Transit côté Vault.
   * @param payloadBase64 Données en clair, encodées base64.
   */
  async transitEncrypt(keyName: string, payloadBase64: string): Promise<string> {
    const res = await this.request<{ data: { ciphertext: string } }>(
      'POST',
      `transit/encrypt/${keyName}`,
      { plaintext: payloadBase64 },
    );
    return res.data.ciphertext;
  }

  /**
   * Déchiffre un ciphertext Transit (`vault:vN:<base64>`). Retourne le
   * plaintext encodé base64 — au caller de décoder selon le type d'origine.
   */
  async transitDecrypt(keyName: string, ciphertext: string): Promise<string> {
    const res = await this.request<{ data: { plaintext: string } }>(
      'POST',
      `transit/decrypt/${keyName}`,
      { ciphertext },
    );
    return res.data.plaintext;
  }

  /**
   * Rotation manuelle d'une clé Transit (réservé policy `admin`).
   * Crée une nouvelle `key_version` ; les anciennes versions restent
   * disponibles pour déchiffrement (sauf si `min_decryption_version`
   * est avancé).
   */
  async rotateTransitKey(keyName: string): Promise<{ newVersion: number }> {
    await this.request('POST', `transit/keys/${keyName}/rotate`);
    const info = await this.request<{ data: { latest_version: number } }>(
      'GET',
      `transit/keys/${keyName}`,
    );
    this.log('info', `Transit key '${keyName}' rotated → v${info.data.latest_version}`);
    return { newVersion: info.data.latest_version };
  }

  /** Vide le cache mémoire (utile après une rotation). */
  clearCache(): void {
    this.cache.clear();
  }

  /** Ferme proprement le client (annule le timer de renouvellement). */
  destroy(): void {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.renewTimer = null;
    this.cache.clear();
    this.token = null;
  }

  // ─── HTTP layer minimal (sans dépendance externe) ──────────────
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    skipAuth = false,
  ): Promise<T> {
    const url = `${this.cfg.endpoint.replace(/\/$/, '')}/v1/${path.replace(/^\//, '')}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!skipAuth && this.token) headers['X-Vault-Token'] = this.token;

    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), this.cfg.requestTimeoutMs!);
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Vault ${method} ${path} → ${response.status} ${text}`);
      }
      // 204 No Content (ex. rotate) → renvoyer un objet vide typé
      if (response.status === 204) return {} as T;
      return (await response.json()) as T;
    } finally {
      clearTimeout(to);
    }
  }
}

/**
 * Helper pour construire un VaultClient à partir des variables
 * d'environnement standards NINA-AES.
 *
 * Variables consommées :
 *   VAULT_ADDR              (obligatoire)
 *   VAULT_AUTH_METHOD       (token | approle | kubernetes, défaut: approle)
 *   VAULT_TOKEN             (si method=token ou dev)
 *   VAULT_APPROLE_ROLE_ID   (si method=approle)
 *   VAULT_APPROLE_SECRET_ID (si method=approle)
 *   VAULT_KUBERNETES_ROLE   (si method=kubernetes)
 */
export function createVaultClientFromEnv(): VaultClient {
  const endpoint = process.env.VAULT_ADDR;
  if (!endpoint) throw new Error('VAULT_ADDR non défini');
  const method = (process.env.VAULT_AUTH_METHOD ?? 'approle') as 'token' | 'approle' | 'kubernetes';

  if (method === 'token') {
    return new VaultClient({
      endpoint,
      auth: { method: 'token', token: process.env.VAULT_TOKEN ?? 'nina-dev' },
    });
  }
  if (method === 'kubernetes') {
    return new VaultClient({
      endpoint,
      auth: { method: 'kubernetes', role: process.env.VAULT_KUBERNETES_ROLE! },
    });
  }
  // Default : AppRole (recommandé pour services en prod)
  return new VaultClient({
    endpoint,
    auth: {
      method: 'approle',
      roleId: process.env.VAULT_APPROLE_ROLE_ID!,
      secretId: process.env.VAULT_APPROLE_SECRET_ID!,
    },
  });
}

export * from './types.js';
