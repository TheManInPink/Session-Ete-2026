/**
 * @file        session.ts
 * @description Helpers de session NINA-AES côté serveur pour l'app admin —
 *              lit/écrit les cookies `access_token`, `refresh_token`,
 *              `id_token`, expose `getSession()` et `requireRole()`.
 *
 *              Mode `NINA_AUTH_MODE=mock` (défaut dev) : retourne un agent
 *              CTDEC fictif (« Modibo Konaté », rôles AGENT + SUPERVISOR)
 *              sans appeler Keycloak. Pratique tant que `auth-service`
 *              et le realm Keycloak nina-admin ne sont pas démarrés.
 *
 *              Mode `NINA_AUTH_MODE=keycloak` : flow OIDC PKCE réel via les
 *              4 route handlers `/api/auth/{login,callback,refresh,logout}`.
 *
 *              Pattern miroir d'`apps/citizen/lib/auth/session.ts` — à
 *              extraire dans `@nina-aes/auth` (Session 4) quand `governance`
 *              rejoindra le repo et qu'on aura 3 copies de ce code.
 *
 * @module      @nina-aes/admin
 */

import { cookies } from 'next/headers';
import { jwtVerify, createRemoteJWKSet } from 'jose';

/** Profil utilisateur agent CTDEC extrait du token. */
export interface AgentProfile {
  /** Identifiant unique (sub du JWT, mappé sur Keycloak ID). */
  id: string;
  /** Email vérifié (ou null si non-vérifié côté Keycloak). */
  email: string | null;
  /** Nom affichable (preferred_username ou name). */
  name: string;
  /** Matricule CTDEC interne (claim custom `matricule`). */
  matricule: string | null;
  /** Centre d'affectation (CTDEC Bamako, RAVEC Kayes, …). */
  centerId: string | null;
  /** Rôles applicatifs (AGENT, SUPERVISOR, AUDITOR, ADMIN). */
  roles: AdminRole[];
  /** Locale préférée (FR, BM, …). */
  locale: string | null;
}

/** Rôles métier de la console agent (alignés sur Keycloak realm `nina-aes`). */
export type AdminRole = 'AGENT' | 'SUPERVISOR' | 'AUDITOR' | 'ADMIN';

/** Session active complète. */
export interface AdminSession {
  user: AgentProfile;
  accessToken: string;
  /** Expiration epoch ms. */
  expiresAt: number;
}

const AUTH_MODE = (process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? '';
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_CLIENT_ID ?? 'nina-admin';

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
 * En mode `mock`, retourne un agent fictif déterministe.
 */
export async function getSession(): Promise<AdminSession | null> {
  // Toujours lire les cookies en premier (cacheComponents requirement).
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
      user: extractAgentFromClaims(payload),
      accessToken,
      expiresAt: exp,
    };
  } catch {
    return null;
  }
}

/**
 * Force une redirection si l'utilisateur n'est pas connecté.
 *
 * @returns La session validée.
 * @throws Lance une exception non-catchable côté serveur si la session
 *         est absente — le proxy aura déjà redirigé en amont.
 */
export async function requireSession(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHORIZED — proxy should redirect to /login');
  }
  return session;
}

/**
 * Force une redirection si l'utilisateur n'a aucun des rôles requis.
 *
 * @example
 *   await requireRole(['AGENT', 'SUPERVISOR']);  // toute personne avec au moins un de ces rôles
 *   await requireRole(['ADMIN']);                // strictement admin
 */
export async function requireRole(roles: AdminRole[]): Promise<AdminSession> {
  const session = await requireSession();
  const hasRole = session.user.roles.some((r) => roles.includes(r));
  if (!hasRole) {
    throw new Error(
      `FORBIDDEN — required one of [${roles.join(', ')}], got [${session.user.roles.join(', ')}]`,
    );
  }
  return session;
}

/** Vérifie si la session courante a au moins un des rôles donnés (booléen). */
export async function hasRole(roles: AdminRole[]): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return session.user.roles.some((r) => roles.includes(r));
}

/** Extrait le profil agent depuis les claims JWT décodés. */
function extractAgentFromClaims(claims: Record<string, unknown>): AgentProfile {
  const realm_access = claims.realm_access as { roles?: string[] } | undefined;
  const allRoles = realm_access?.roles ?? [];
  const adminRoles = allRoles.filter((r): r is AdminRole =>
    ['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN'].includes(r),
  );

  return {
    id: String(claims.sub ?? ''),
    email: typeof claims.email === 'string' ? claims.email : null,
    name:
      (typeof claims.name === 'string' && claims.name) ||
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      'Agent',
    matricule: typeof claims.matricule === 'string' ? claims.matricule : null,
    centerId: typeof claims.center_id === 'string' ? claims.center_id : null,
    roles: adminRoles,
    locale: typeof claims.locale === 'string' ? claims.locale : null,
  };
}

/** Session fictive pour mode `mock` (déterministe, agent CTDEC fictif). */
function getMockSession(): AdminSession {
  return {
    user: {
      id: 'mock-agent-001',
      email: 'modibo.konate@ctdec.ml',
      name: 'Modibo Konaté',
      matricule: 'CTDEC-2024-0156',
      centerId: 'ctdec-bamako',
      roles: ['AGENT', 'SUPERVISOR'],
      locale: 'fr',
    },
    accessToken: 'mock-access-token-development-only',
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}
