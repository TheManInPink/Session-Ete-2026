/**
 * @file        session.ts
 * @description Helpers de session côté serveur — `getSession()`,
 *              `requireSession()`, `requireRole()`, `hasRole()`.
 *
 *              Pattern miroir de l'ancien `apps/citizen/lib/auth/session.ts`
 *              et `apps/admin/lib/auth/session.ts` (qui en sont maintenant
 *              des consommateurs).
 *
 *              IMPORTANT : `getSession()` lit `cookies()` inconditionnellement
 *              en première instruction — exigé par Next 16 + `cacheComponents`
 *              pour signaler le caractère dynamique de la page avant tout
 *              accès à `Date.now()` ou tokens.
 *
 * @module      @nina-aes/auth
 */

import { cookies } from 'next/headers';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { resolveAuthMode } from './auth-mode';
import type { AuthConfig, Role, Session, UserProfile } from './types';

/** Cache module-level des JWKS par issuer (jose gère son propre cache 10 min). */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(issuer: string) {
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    jwksCache.set(issuer, jwks);
  }
  return jwks;
}

/** Lit la session active depuis les cookies, ou null si non connecté. */
export async function getSession(config: AuthConfig): Promise<Session | null> {
  // Toujours lire cookies() d'abord (cacheComponents requirement).
  const jar = await cookies();

  const authMode = resolveAuthMode(config);
  if (authMode === 'mock') return getMockSession(config);

  const accessToken = jar.get('access_token')?.value;
  if (!accessToken) return null;

  const issuer = config.keycloakIssuer ?? process.env.KEYCLOAK_ISSUER ?? '';
  if (!issuer) return null;

  try {
    const { payload } = await jwtVerify(accessToken, getJwks(issuer), {
      issuer,
      audience: config.clientId,
    });

    const exp = (payload.exp ?? 0) * 1000;
    if (exp < Date.now()) return null;

    return {
      user: extractUserFromClaims(payload),
      accessToken,
      expiresAt: exp,
    };
  } catch {
    // Token invalide ou expiré : session null sans logger (cas normal).
    return null;
  }
}

/** Force une session active — sinon throw (le proxy aura redirigé en amont). */
export async function requireSession(config: AuthConfig): Promise<Session> {
  const session = await getSession(config);
  if (!session) {
    throw new Error('UNAUTHORIZED — proxy should redirect to /login');
  }
  return session;
}

/** Force au moins un des rôles donnés — sinon throw FORBIDDEN. */
export async function requireRole(config: AuthConfig, roles: Role[]): Promise<Session> {
  const session = await requireSession(config);
  const hasOne = session.user.roles.some((r) => roles.includes(r));
  if (!hasOne) {
    throw new Error(
      `FORBIDDEN — required one of [${roles.join(', ')}], got [${session.user.roles.join(', ')}]`,
    );
  }
  return session;
}

/** Booléen — utile pour conditions UI sans lever d'exception. */
export async function hasRole(config: AuthConfig, roles: Role[]): Promise<boolean> {
  const session = await getSession(config);
  if (!session) return false;
  return session.user.roles.some((r) => roles.includes(r));
}

/** Vérifie si la session courante est propriétaire d'un NINA donné. */
export async function isOwnerOf(config: AuthConfig, nina: string): Promise<boolean> {
  const session = await getSession(config);
  if (!session) return false;
  return session.user.nina === nina;
}

/** Extrait UserProfile depuis les claims JWT décodés. */
function extractUserFromClaims(claims: Record<string, unknown>): UserProfile {
  const realm_access = claims.realm_access as { roles?: string[] } | undefined;
  const allRoles = realm_access?.roles ?? [];
  const KNOWN_ROLES: Role[] = [
    'CITIZEN',
    'VULNERABLE',
    'AGENT',
    'SUPERVISOR',
    'AUDITOR',
    'ADMIN',
    'ANTICORRUPTION_INSPECTOR',
    'MINISTER',
    'CABINET',
  ];
  // Le realm Keycloak déclare les rôles en MINUSCULE (`citizen`, `agent`,
  // `anticorruption_inspector`… cf. infrastructure/keycloak/import/realm-nina-aes.json)
  // alors que le contrat applicatif Role est en MAJUSCULE (doc 08 §369 :
  // `anticorruption_inspector` → ANTICORRUPTION_INSPECTOR). On normalise donc en
  // MAJUSCULE AVANT le filtrage — sinon TOUS les rôles seraient silencieusement
  // écartés en mode keycloak (fail-closed involontaire = 403 pour tout le monde).
  const roles = allRoles
    .map((r) => r.toUpperCase())
    .filter((r): r is Role => (KNOWN_ROLES as string[]).includes(r));

  return {
    id: String(claims.sub ?? ''),
    email: typeof claims.email === 'string' ? claims.email : null,
    name:
      (typeof claims.name === 'string' && claims.name) ||
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      'Utilisateur',
    nina: typeof claims.nina === 'string' ? claims.nina : null,
    matricule: typeof claims.matricule === 'string' ? claims.matricule : null,
    centerId: typeof claims.center_id === 'string' ? claims.center_id : null,
    roles,
    locale: typeof claims.locale === 'string' ? claims.locale : null,
  };
}

/** Session fictive en mode `mock` — utilise `mockProfile` ou fallback générique. */
function getMockSession(config: AuthConfig): Session {
  const user: UserProfile = config.mockProfile ?? {
    id: 'mock-user-001',
    email: 'mock@nina-aes.demo',
    name: 'Utilisateur fictif',
    nina: null,
    matricule: null,
    centerId: null,
    roles: ['CITIZEN'],
    locale: 'fr',
  };
  return {
    user,
    accessToken: 'mock-access-token-development-only',
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}
