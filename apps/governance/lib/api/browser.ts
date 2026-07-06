/**
 * @file        browser.ts
 * @description Construit le client API **côté navigateur** consommé par les
 *              hooks React Query, selon le mode (mock | live).
 *
 *              Sécurité — transport **authentifié uniquement** en mode live :
 *              les appels passent par le BFF `app/api/v1/[...path]`, qui lit le
 *              cookie httpOnly et ajoute `Authorization` côté serveur. Le token
 *              n'est JAMAIS exposé au JavaScript. Contrairement à apps/citizen,
 *              le portail gouvernance n'a AUCUN flux anonyme (pas de transport
 *              SIGAC direct).
 *
 * @module      @nina-aes/governance
 */

import { createApiClient, createMockApiClient, type ApiClient } from '@nina-aes/api-client';
import { appPublicUrl, resolveApiMode } from './config';

/** Crée le client API utilisé par les hooks (mock ou live). */
export function createBrowserApi(): ApiClient {
  if (resolveApiMode() === 'mock') {
    return createMockApiClient();
  }

  // Transport authentifié : same-origin → BFF → gateway (cookie httpOnly).
  // ⚠️ SÉCURITÉ : ne JAMAIS ajouter `getAccessToken` ici. L'identité est
  // injectée côté serveur par le BFF depuis le cookie httpOnly ; exposer le
  // token au JavaScript ré-ouvrirait une surface XSS.
  return createApiClient({
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
    userAgent: 'nina-aes-governance-web/0.1',
  });
}
