/**
 * @file        server.ts
 * @description Couche données **côté serveur** (Server Components / RSC) de la
 *              console agent.
 *
 *              En mode live, le token d'accès est lu depuis le cookie httpOnly
 *              `access_token` et injecté en `Authorization: Bearer` vers le
 *              gateway — il ne transite jamais par le navigateur. En mode mock,
 *              on renvoie des fixtures déterministes (aucune E/S réseau).
 *
 * @module      @nina-aes/admin
 */

import 'server-only';

import { cookies } from 'next/headers';
import {
  createApiClient,
  createMockApiClient,
  type AdminDashboardStats,
  type ApiClient,
  type CorrectionList,
  type CorrectionListParams,
} from '@nina-aes/api-client';
import { gatewayInternalUrl, resolveApiMode } from './config';

/** Construit un client API réel lié à la session serveur (cookie → Bearer). */
function liveServerApi(): ApiClient {
  return createApiClient({
    baseUrl: gatewayInternalUrl(),
    getAccessToken: async () => (await cookies()).get('access_token')?.value ?? null,
    // En RSC, on ne tente pas de refresh inline : un 401 remonte au caller
    // (la page redirige vers /login si nécessaire).
    onUnauthorized: async () => null,
    userAgent: 'nina-aes-admin-rsc/0.1',
  });
}

/**
 * Client API serveur selon le mode. Recréé à chaque appel pour garantir une
 * lecture de cookie **fraîche** par requête (ne jamais mettre en cache).
 */
function serverApi(): ApiClient {
  return resolveApiMode() === 'mock' ? createMockApiClient() : liveServerApi();
}

/**
 * AD-01 / AD-03 — statistiques agrégées du dashboard admin.
 *
 * Contrat honnête : chaque section sans source backend (agrégation Bloc D non
 * implémentée) vaut `null` — les pages doivent rendre un état « indisponible »,
 * jamais un zéro menteur.
 */
export async function fetchAdminDashboardStats(): Promise<AdminDashboardStats> {
  return serverApi().adminDashboard.getStats();
}

/**
 * AD-02 — page de corrections côté serveur (en-têtes, compteurs).
 *
 * @param params - Filtres backend (`status`, `agent`, `from`/`to`, pagination).
 * @returns La page normalisée `{ items, total, page, pageSize }`.
 */
export async function fetchCorrectionsPage(
  params: CorrectionListParams = {},
): Promise<CorrectionList> {
  return serverApi().correction.list(params);
}
