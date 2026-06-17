/**
 * @file        browser.ts
 * @description Construit le client API **côté navigateur** consommé par les
 *              hooks React Query, selon le mode (mock | live).
 *
 *              Sécurité — deux transports distincts en mode live :
 *                1. Appels **authentifiés** → base same-origin : ils passent par
 *                   le BFF `app/api/v1/[...path]`, qui lit le cookie httpOnly et
 *                   ajoute `Authorization` côté serveur. Le token n'est JAMAIS
 *                   exposé au JavaScript.
 *                2. Signalement **anonyme** (SIGAC) → appel DIRECT au gateway
 *                   public avec `credentials: 'omit'` : aucun cookie ne part,
 *                   l'anonymat est garanti au niveau transport.
 *
 * @module      @nina-aes/citizen
 */

import { createApiClient, createMockApiClient, type ApiClient } from '@nina-aes/api-client';
import { appPublicUrl, gatewayPublicUrl, resolveApiMode } from './config';

/** Crée le client API utilisé par les hooks (mock ou live). */
export function createBrowserApi(): ApiClient {
  if (resolveApiMode() === 'mock') {
    return createMockApiClient();
  }

  // Transport authentifié : same-origin → BFF → gateway (cookie httpOnly).
  // ⚠️ SÉCURITÉ : ne JAMAIS ajouter `getAccessToken` ici. L'identité est
  // injectée côté serveur par le BFF depuis le cookie httpOnly ; exposer le
  // token au JavaScript ré-ouvrirait une surface XSS.
  const authenticated = createApiClient({
    baseUrl: appPublicUrl(),
    // Sur 401, on tente un refresh silencieux du cookie puis on rejoue la
    // requête (le BFF relira le nouveau cookie). La valeur retournée n'est
    // qu'un drapeau « réessaye » — aucun token ne transite par le client.
    onUnauthorized: async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        return res.ok ? 'retry' : null;
      } catch {
        return null;
      }
    },
    userAgent: 'nina-aes-citizen-web/0.1',
  });

  // Transport anonyme dédié au signalement SIGAC : gateway public, sans cookie.
  const anonymous = createApiClient({
    baseUrl: gatewayPublicUrl(),
    credentials: 'omit',
    userAgent: 'nina-aes-citizen-anon/0.1',
  });

  return { ...authenticated, sigac: anonymous.sigac };
}
