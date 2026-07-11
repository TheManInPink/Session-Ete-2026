/**
 * @file        types.ts
 * @description Types partagés du package auth — Session, UserProfile,
 *              Role union. Conçus pour couvrir les besoins de citizen
 *              (CITIZEN + VULNERABLE) et admin (AGENT, SUPERVISOR,
 *              AUDITOR, ADMIN) sans branche conditionnelle.
 * @module      @nina-aes/auth
 */

/** Tous les rôles métier supportés par le realm Keycloak `nina-aes`. */
export type Role =
  // Côté citoyen
  | 'CITIZEN'
  | 'VULNERABLE'
  // Côté agent admin / inspection
  | 'AGENT'
  | 'SUPERVISOR'
  | 'AUDITOR'
  | 'ADMIN'
  // Inspecteur anti-corruption OCLEI (module SIGAC) — rôle ISOLÉ, hors chaîne
  // d'héritage agent (cf. doc 08 §2798). Seul habilité à lire la file procureur
  // des signalements scellés (compartimentation vis-à-vis SUPERVISOR/AUDITOR/ADMIN).
  | 'ANTICORRUPTION_INSPECTOR'
  // Côté gouvernance (Session 6+)
  | 'MINISTER'
  | 'CABINET';

/** Profil utilisateur extrait du JWT — superset citoyen + agent. */
export interface UserProfile {
  /** sub du JWT. */
  id: string;
  /** Email vérifié ou null. */
  email: string | null;
  /** Nom affichable (name ou preferred_username). */
  name: string;
  /** NINA du citoyen (claim `nina`). Null pour les agents/ministres. */
  nina: string | null;
  /** Matricule CTDEC/DNEC (claim `matricule`). Null pour les citoyens. */
  matricule: string | null;
  /** Centre d'affectation (claim `center_id`). Null pour les citoyens. */
  centerId: string | null;
  /** Rôles applicatifs. */
  roles: Role[];
  /** Locale préférée. */
  locale: string | null;
}

/** Session active complète. */
export interface Session {
  user: UserProfile;
  accessToken: string;
  /** Expiration epoch ms. */
  expiresAt: number;
}

/** Mode d'authentification — `mock` court-circuite Keycloak. */
export type AuthMode = 'mock' | 'keycloak';

/** Configuration commune aux 4 handlers d'auth. */
export interface AuthConfig {
  /** Client ID Keycloak côté app (ex: 'nina-citizen', 'nina-admin'). */
  clientId: string;
  /** URL publique de l'app (utilisée pour redirect_uri OIDC). */
  appPublicUrl: string;
  /** Mode d'authentification (lu depuis env par défaut). */
  authMode?: AuthMode;
  /** Issuer Keycloak (lu depuis env par défaut). */
  keycloakIssuer?: string;
  /** Locale par défaut pour les redirections. */
  defaultLocale?: string;
  /** Path par défaut après login (ex: '/dashboard'). */
  defaultNext?: string;
  /** Profil mock retourné en mode `authMode=mock`. Si absent, profil
   *  générique « Utilisateur fictif ». Permet aux apps d'injecter un
   *  citoyen ou un agent réaliste. */
  mockProfile?: UserProfile;
  /**
   * URL COMPLÈTE de l'échange SSO auth-service (`…/api/v1/auth/sso/exchange`).
   * Défini UNIQUEMENT par l'app **citoyen** : quand présent, `callback`/`refresh`
   * échangent le token Keycloak contre une session applicative (cookie
   * `backend_access_token`) transmise au backend. Absent (admin/gouvernance) ⇒
   * aucun échange (no-op). @see ADR-036
   */
  backendExchangeUrl?: string;
}
