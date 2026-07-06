/**
 * @file        http-client.ts
 * @description Client HTTP typé NINA-AES.
 *              - Validation Zod automatique des réponses
 *              - Retry exponentiel sur 5xx
 *              - Header `X-Correlation-Id` pour traçabilité
 *              - Refresh token transparent sur 401 (via onUnauthorized)
 *              - Timeout configurable
 *
 * @module      @nina-aes/api-client
 */

import type { ZodType } from 'zod';
import { ApiError, ApiNetworkError, ApiValidationError } from './errors';

/** Génère un correlation-id court horodaté + bytes aléatoires (16 chars). */
function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
  return `c-${ts}-${hex}`;
}

/** Retry exponentiel avec jitter sur erreurs serveur transitoires. */
async function retryWithBackoff(
  fn: () => Promise<Response>,
  opts: { maxRetries: number; retryOn?: (r: Response) => boolean; baseDelayMs?: number },
): Promise<Response> {
  const base = opts.baseDelayMs ?? 250;
  let last: unknown;
  for (let i = 0; i <= opts.maxRetries; i++) {
    try {
      const res = await fn();
      if (i < opts.maxRetries && opts.retryOn?.(res)) {
        await new Promise((r) => setTimeout(r, base * 2 ** i + Math.random() * 100));
        continue;
      }
      return res;
    } catch (err) {
      last = err;
      if (i === opts.maxRetries) break;
      await new Promise((r) => setTimeout(r, base * 2 ** i + Math.random() * 100));
    }
  }
  throw last ?? new Error('retry exhausted');
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Fournit l'access token courant (sync ou async). */
  getAccessToken?: () => Promise<string | null> | string | null;
  /** Appelé sur 401 — doit renvoyer un nouveau token ou null. */
  onUnauthorized?: () => Promise<string | null>;
  /** Timeout par requête en ms (défaut : 15 000). */
  defaultTimeoutMs?: number;
  /** Nombre de retries sur 5xx (défaut : 2). */
  maxRetries?: number;
  /** User-Agent envoyé (utile pour différencier RSC vs client). */
  userAgent?: string;
  /**
   * Politique de cookies du `fetch`. Laisser indéfini = comportement par
   * défaut du navigateur (`same-origin`). Mettre `'omit'` pour les transports
   * **anonymes** (ex. signalement SIGAC) afin qu'AUCUN cookie ne parte —
   * garantie d'anonymat même sur une requête same-origin.
   */
  credentials?: RequestCredentials;
}

export interface RequestOptions<TBody = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  headers?: Record<string, string>;
  /** Schéma Zod pour valider la réponse JSON. */
  schema?: ZodType<unknown>;
  signal?: AbortSignal;
  /** Ne pas inclure l'Authorization header (endpoints publics). */
  skipAuth?: boolean;
  /** Clé d'idempotence (POST sensibles). */
  idempotencyKey?: string;
}

export class HttpClient {
  constructor(private readonly opts: HttpClientOptions) {}

  /**
   * Exécute une requête HTTP typée avec retry + validation Zod.
   *
   * @throws {ApiError} statut HTTP >= 400.
   * @throws {ApiNetworkError} timeout ou erreur réseau.
   * @throws {ApiValidationError} réponse 2xx mais charge utile invalide.
   */
  async request<TResult>(options: RequestOptions): Promise<TResult> {
    const timeout = this.opts.defaultTimeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const correlationId = generateCorrelationId();
    const url = this.buildUrl(options.path, options.query);

    const perform = async (): Promise<Response> => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': this.opts.userAgent ?? 'nina-aes-client/0.1',
        ...options.headers,
      };
      // 🔒 ANTI-CORRÉLATION : sur un transport anonyme (`skipAuth`, ex.
      // signalement SIGAC), on N'ENVOIE PAS le `X-Correlation-Id` — il est
      // horodaté (`c-<ts>-…`) et fournirait un vecteur de corrélation temporelle
      // du lanceur d'alerte. Il reste généré localement pour tracer les erreurs
      // client, mais ne quitte jamais le navigateur sur ce chemin.
      if (!options.skipAuth) headers['X-Correlation-Id'] = correlationId;
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      if (!options.skipAuth && this.opts.getAccessToken) {
        const token = await this.opts.getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      return fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal ?? controller.signal,
        cache: 'no-store',
        credentials: this.opts.credentials,
      });
    };

    try {
      let response = await retryWithBackoff(perform, {
        maxRetries: this.opts.maxRetries ?? 2,
        retryOn: (res) => res.status >= 500 && res.status < 600,
      });

      // Refresh transparent sur 401 (une seule tentative)
      if (response.status === 401 && !options.skipAuth && this.opts.onUnauthorized) {
        const newToken = await this.opts.onUnauthorized();
        if (newToken) response = await perform();
      }

      return await this.parseResponse<TResult>(response, options, correlationId);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiNetworkError('Request timeout', { correlationId, timeoutMs: timeout });
      }
      if (err instanceof ApiError || err instanceof ApiValidationError) throw err;
      throw new ApiNetworkError((err as Error).message, { correlationId });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Construit l'URL finale.
   *
   * ⚠️ Invariant : `baseUrl` doit être une **origine** (ex. `http://host:3000`),
   * sans chemin. Les clients utilisent des chemins **absolus** (`/api/v1/…`) ;
   * or un chemin absolu passé à `new URL(path, base)` **remplace** entièrement
   * le pathname de `base`. Un `baseUrl` avec préfixe (ex. `.../api`) serait donc
   * silencieusement ignoré. Tous les `*Url()` de la config respectent ce contrat.
   */
  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path, this.opts.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.append(k, String(v));
      }
    }
    return url.toString();
  }

  private async parseResponse<TResult>(
    response: Response,
    options: RequestOptions,
    correlationId: string,
  ): Promise<TResult> {
    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const raw = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        statusText: response.statusText,
        payload: raw,
        correlationId,
      });
    }

    if (!options.schema) return raw as TResult;

    const parsed = options.schema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiValidationError({
        endpoint: options.path,
        issues: parsed.error.issues,
        correlationId,
      });
    }
    return parsed.data as TResult;
  }
}
