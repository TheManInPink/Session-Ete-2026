/**
 * @file        server.ts
 * @description Couche données **côté serveur** (Server Components / RSC).
 *
 *              En mode live, le token d'accès est lu depuis le cookie httpOnly
 *              `access_token` et injecté en `Authorization: Bearer` vers le
 *              gateway — il ne transite jamais par le navigateur. En mode mock,
 *              on renvoie des fixtures déterministes (aucune E/S réseau).
 *
 *              GOV-01/GOV-02 sont des écrans **client** (polling + mutations
 *              React Query) : ils passent par `browser.ts`. Cette couche sert
 *              aux futurs besoins RSC (préchargement, rapports, exports).
 *
 * @module      @nina-aes/governance
 */

import 'server-only';

import { cookies } from 'next/headers';
import { createApiClient, createMockApiClient, type ApiClient } from '@nina-aes/api-client';
import { gatewayInternalUrl, resolveApiMode } from './config';
import { buildMockPerformance, type PerformanceOverview } from '../performance/institutions';
import { buildMockReports, type ReportsOverview } from '../reports/monthly';

/** Construit un client API réel lié à la session serveur (cookie → Bearer). */
function liveServerApi(): ApiClient {
  return createApiClient({
    baseUrl: gatewayInternalUrl(),
    getAccessToken: async () => (await cookies()).get('access_token')?.value ?? null,
    // En RSC, on ne tente pas de refresh inline : un 401 remonte au caller
    // (la page redirige vers /login si nécessaire).
    onUnauthorized: async () => null,
    userAgent: 'nina-aes-governance-rsc/0.1',
  });
}

/**
 * Client API serveur selon le mode. Recréé à chaque appel pour garantir une
 * lecture de cookie **fraîche** par requête (ne jamais mettre en cache).
 */
export function serverApi(): ApiClient {
  return resolveApiMode() === 'mock' ? createMockApiClient() : liveServerApi();
}

/**
 * GOV — Performance institutionnelle : métriques de traçabilité/réactivité par
 * institution.
 *
 * Contrat honnête : `governance-service` (doc 22) n'expose pas encore
 * d'agrégation de performance. En mode live on renvoie `null` (la page rend un
 * état « indisponible ») ; en mode mock, un jeu déterministe de démonstration.
 */
export function fetchInstitutionPerformance(): PerformanceOverview | null {
  return resolveApiMode() === 'mock' ? buildMockPerformance() : null;
}

/**
 * GOV — Rapports : synthèses mensuelles de gouvernance et d'exécution.
 *
 * Contrat honnête : la génération de rapports par `governance-service` (doc 22)
 * n'existe pas encore. En mode live on renvoie `null` (état « indisponible ») ;
 * en mode mock, un jeu déterministe de démonstration.
 */
export function fetchGovernanceReports(): ReportsOverview | null {
  return resolveApiMode() === 'mock' ? buildMockReports() : null;
}
