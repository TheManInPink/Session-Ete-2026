/**
 * @file        browser.ts
 * @description Construit le client API **côté navigateur** consommé par les
 *              hooks React Query de la console agent, selon le mode
 *              (mock | live).
 *
 *              Sécurité — un SEUL transport en mode live, authentifié : les
 *              appels passent par le BFF same-origin `app/api/v1/[...path]`,
 *              qui lit le cookie httpOnly et ajoute `Authorization` côté
 *              serveur. Le token n'est JAMAIS exposé au JavaScript.
 *
 *              ⚠️ Différence avec citizen : PAS de transport anonyme ici. Le
 *              sous-client `sigac` de la console sert la **file procureur**
 *              (`getQueue`, réservée INSPECTOR/PROSECUTOR) — un endpoint
 *              authentifié — et passe donc par le même transport BFF.
 *
 * @module      @nina-aes/admin
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
    userAgent: 'nina-aes-admin-web/0.1',
  });
}
