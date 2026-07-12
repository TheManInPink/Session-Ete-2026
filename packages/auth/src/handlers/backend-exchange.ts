/**
 * @file        handlers/backend-exchange.ts
 * @description Échange SSO citoyen (ADR-036) : POST le token Keycloak à l'endpoint
 *              `sso/exchange` d'auth-service (server-to-server, hors edge public)
 *              et récupère une **session applicative** (JWT auth-service) que le
 *              gateway + les services aval acceptent.
 *
 *              Appelé par les handlers `callback` et `refresh` UNIQUEMENT quand
 *              `config.backendExchangeUrl` est défini (app citoyen). Absent pour
 *              admin/gouvernance ⇒ no-op (`null`). **Non-fatal** : tout échec
 *              renvoie `null` (la session Keycloak reste valide ; les appels
 *              backend authentifiés répondront 401 → re-login).
 *
 * @module      @nina-aes/auth
 */

import { z } from 'zod';
import type { AuthConfig } from '../types';

/** Sous-ensemble de l'`AuthSession` d'auth-service utile côté portail. */
const ExchangeResponseSchema = z.object({
  access: z.string(),
  expiresIn: z.number().int().positive(),
});

export interface BackendToken {
  /** Access token applicatif (RS256 auth-service) à poser en cookie. */
  access: string;
  /** Durée de vie en secondes (aligne le `maxAge` du cookie). */
  expiresIn: number;
}

/**
 * Échange un access token Keycloak contre un token backend auth-service.
 *
 * @returns Le token backend, ou `null` si l'échange n'est pas configuré
 *          (admin/gov) ou échoue (réseau, non-2xx, réponse invalide). Jamais
 *          de throw — l'appelant traite `null` comme « pas de token backend ».
 */
export async function exchangeBackendToken(
  config: AuthConfig,
  keycloakToken: string,
): Promise<BackendToken | null> {
  if (!config.backendExchangeUrl) return null;
  try {
    const res = await fetch(config.backendExchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ keycloakToken }),
    });
    if (!res.ok) return null;
    const parsed = ExchangeResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
