/**
 * @file        session.ts
 * @description Helpers de session NINA-AES côté serveur — lit/écrit les cookies
 *              `access_token`, `refresh_token`, `id_token`, expose `getSession()`.
 *
 *              Mode `NINA_AUTH_MODE=mock` (défaut en dev) : retourne un user
 *              fictif sans appeler Keycloak. Pratique tant que `auth-service`
 *              et Keycloak ne sont pas démarrés.
 *
 *              Mode `NINA_AUTH_MODE=keycloak` : flow OIDC PKCE réel via les
 *              4 route handlers `/api/auth/{login,callback,refresh,logout}`.
 *
 * @module      @nina-aes/citizen
 */

import { cookies } from 'next/headers';
import { jwtVerify, createRemoteJWKSet } from 'jose';

/** Profil utilisateur minimal extrait du token. */
export interface UserProfile {
  /** Identifiant unique (sub du JWT, mappé sur Keycloak ID). */
  id: string;
  /** Email vérifié (ou null si non-vérifié côté Keycloak). */
  email: string | null;
  /** Nom affichable (preferred_username ou name). */
  name: string;
  /** NINA du citoyen (claim custom `nina`). */
  nina: string | null;
  /** Rôles applicatifs (CITIZEN, AGENT, …). */
  roles: string[];
  /** Locale préférée (FR, BM, …). */
  locale: string | null;
}

/** Session active complète. */
export interface Session {
  user: UserProfile;
  accessToken: string;
  /** Expiration epoch ms. */
  expiresAt: number;
}

const AUTH_MODE = (process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? '';
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_CLIENT_ID ?? 'nina-citizen';

/**
 * JWKS distant — récupère et cache les clés publiques de Keycloak.
 * Le cache est interne à `jose` (TTL 10 min par défaut).
 */
const jwks = KEYCLOAK_ISSUER
  ? createRemoteJWKSet(new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`))
  : null;

/**
 * Retourne la session courante depuis les cookies, ou `null` si non-connecté.
 *
 * En mode `mock`, retourne un user fictif déterministe (utile pour SSR
 * démos sans backend).
 */
export async function getSession(): Promise<Session | null> {
  // Toujours lire les cookies en premier — Next 16 + `cacheComponents` exige
  // une lecture de Request data (cookies/headers/searchParams) avant tout
  // accès au temps courant (Date.now()) ou autre source non-cacheable, afin
  // de pouvoir classer la page comme dynamique. Sans cette lecture, le mode
  // mock déclencherait une erreur `next-prerender-current-time` à chaque
  // appel à `getMockSession()`.
  const jar = await cookies();

  if (AUTH_MODE === 'mock') return getMockSession();

  const accessToken = jar.get('access_token')?.value;
  if (!accessToken) return null;

  try {
    const { payload } = await jwtVerify(accessToken, jwks!, {
      issuer: KEYCLOAK_ISSUER,
      audience: KEYCLOAK_AUDIENCE,
    });

    const exp = (payload.exp ?? 0) * 1000;
    if (exp < Date.now()) return null;

    return {
      user: extractUserFromClaims(payload),
      accessToken,
      expiresAt: exp,
    };
  } catch {
    // Token invalide ou expiré : on retourne null sans logger (cas normal).
    return null;
  }
}

/**
 * Force une redirection si l'utilisateur n'est pas connecté.
 *
 * @returns La session validée.
 * @throws Lance une exception non-catchable côté serveur si la session
 *         est absente — le middleware aura déjà redirigé en amont.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED — middleware should redirect to /login');
  }
  return session;
}

/** Extrait le profil utilisateur depuis les claims JWT décodés. */
function extractUserFromClaims(claims: Record<string, unknown>): UserProfile {
  const realm_access = claims.realm_access as { roles?: string[] } | undefined;
  return {
    id: String(claims.sub ?? ''),
    email: typeof claims.email === 'string' ? claims.email : null,
    name:
      (typeof claims.name === 'string' && claims.name) ||
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      'Utilisateur',
    nina: typeof claims.nina === 'string' ? claims.nina : null,
    roles: realm_access?.roles ?? [],
    locale: typeof claims.locale === 'string' ? claims.locale : null,
  };
}

/** Session fictive pour mode `mock` (déterministe, citoyen fictif Fatoumata Diallo). */
function getMockSession(): Session {
  return {
    user: {
      id: 'mock-citizen-001',
      email: 'fatoumata.diallo@nina-aes.demo',
      name: 'Fatoumata Diallo',
      nina: '18903102015042Z',
      roles: ['CITIZEN'],
      locale: 'fr',
    },
    accessToken: 'mock-access-token-development-only',
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}
