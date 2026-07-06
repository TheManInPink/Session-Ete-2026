/**
 * @file        server.ts
 * @description Couche données **côté serveur** (Server Components / RSC).
 *
 *              En mode live, le token d'accès est lu depuis le cookie httpOnly
 *              `access_token` et injecté en `Authorization: Bearer` vers le
 *              gateway — il ne transite jamais par le navigateur. En mode mock,
 *              on renvoie des fixtures déterministes (aucune E/S réseau).
 *
 * @module      @nina-aes/citizen
 */

import 'server-only';

import { cookies } from 'next/headers';
import {
  ApiError,
  createApiClient,
  createMockApiClient,
  ficheFromCitizen,
  ficheFromDemo,
  generateDemoCitizen,
  type ApiClient,
  type Appointment,
  type CitizenFiche,
  type CorrectionRequest,
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
    userAgent: 'nina-aes-citizen-rsc/0.1',
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
 * Récupère la fiche citoyen (PC-02) depuis la bonne source selon le mode.
 *
 * @param nina - NINA en 15 caractères (déjà validé en amont).
 * @returns La {@link CitizenFiche} ou `null` si le NINA est introuvable (404).
 */
export async function fetchCitizenFiche(nina: string): Promise<CitizenFiche | null> {
  if (resolveApiMode() === 'mock') {
    // Profil démo riche (région nommée, naissance estimée) → bannière « démo ».
    return ficheFromDemo(generateDemoCitizen(nina));
  }
  try {
    const citizen = await liveServerApi().identity.getByNina(nina);
    return ficheFromCitizen(citizen);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * PC-05 — corrections du citoyen AUTHENTIFIÉ.
 *
 * 🔒 Self-scoped : appelle `GET /corrections/me`, où le backend dérive le NINA
 * du token (jamais d'un paramètre client). On n'appelle PLUS `correction.list()`
 * (réservé aux agents et qui ignorait tout filtre `nina` — un citoyen recevait
 * soit un 403, soit potentiellement TOUT le périmètre).
 */
export async function fetchMyCorrections(): Promise<CorrectionRequest[]> {
  return serverApi().correction.listMine();
}

/** PC-05 — rendez-vous du citoyen connecté. */
export async function fetchMyAppointments(): Promise<Appointment[]> {
  const res = await serverApi().appointment.listMine();
  return res.items;
}
