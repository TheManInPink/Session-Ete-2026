/**
 * @file        errors.ts
 * @description 3 classes d'erreurs typées pour le client HTTP NINA-AES.
 * @module      @nina-aes/api-client
 */

import type { $ZodIssue } from 'zod/v4/core';

/** Corps d'erreur conventionnel renvoyé par les API NestJS / FastAPI. */
export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

/**
 * Erreur HTTP avec code de statut. Lancée quand le serveur répond avec 4xx/5xx.
 *
 * - `isUserError` (4xx) : l'utilisateur peut corriger sa saisie.
 * - `isServerError` (5xx) : problème backend, à logguer.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly payload: ApiErrorBody | string;
  readonly correlationId: string;
  readonly code?: string;

  constructor(params: {
    status: number;
    statusText: string;
    payload: ApiErrorBody | string;
    correlationId: string;
  }) {
    const body = typeof params.payload === 'object' && params.payload !== null ? params.payload : null;
    super(body?.message ?? params.statusText);
    this.name = 'ApiError';
    this.status = params.status;
    this.statusText = params.statusText;
    this.payload = params.payload;
    this.correlationId = params.correlationId;
    this.code = body?.code;
  }

  get isUserError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/** Erreur réseau (timeout, DNS, refus de connexion). */
export class ApiNetworkError extends Error {
  readonly correlationId?: string;
  readonly timeoutMs?: number;
  constructor(message: string, meta: { correlationId?: string; timeoutMs?: number } = {}) {
    super(message);
    this.name = 'ApiNetworkError';
    this.correlationId = meta.correlationId;
    this.timeoutMs = meta.timeoutMs;
  }
}

/** Le serveur a répondu 2xx mais la charge utile ne matche pas le schéma Zod. */
export class ApiValidationError extends Error {
  readonly endpoint: string;
  readonly issues: $ZodIssue[];
  readonly correlationId: string;
  constructor(params: { endpoint: string; issues: $ZodIssue[]; correlationId: string }) {
    super(
      `Réponse API invalide sur ${params.endpoint} (${params.issues.length} issue${
        params.issues.length > 1 ? 's' : ''
      })`,
    );
    this.name = 'ApiValidationError';
    this.endpoint = params.endpoint;
    this.issues = params.issues;
    this.correlationId = params.correlationId;
  }
}
