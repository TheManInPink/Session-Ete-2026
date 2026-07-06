/**
 * @file        types.ts
 * @description Types partagés du auth-service.
 *
 *              - `UserRole` : 6 rôles RBAC alignés sur PROMPT 3.2 + doc 08 §3.4.
 *                  - composites Keycloak : admin > supervisor > agent > citizen
 *                  - rôles transverses : auditor, anticorruption_inspector
 *              - `JwtPayload` / `RefreshPayload` : structure des tokens RS256.
 *              - `AuthSubject` : projection minimale d'un user passée aux Guards.
 *
 * @module      auth-service/common
 */

/** Rôles RBAC NINA-AES (cf. doc 08 §3.4 + PROMPT 3.2). */
export enum UserRole {
  CITIZEN = 'citizen',
  AGENT = 'agent',
  SUPERVISOR = 'supervisor',
  ADMIN = 'admin',
  AUDITOR = 'auditor',
  ANTICORRUPTION_INSPECTOR = 'anticorruption_inspector',
}

/** Liste des rôles pour lesquels MFA est OBLIGATOIRE (PROMPT 3.2). */
export const MFA_REQUIRED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.AGENT,
  UserRole.SUPERVISOR,
  UserRole.ADMIN,
  UserRole.AUDITOR,
  UserRole.ANTICORRUPTION_INSPECTOR,
]);

/** Payload du JWT d'accès (RS256, TTL 15 min). */
export interface JwtAccessPayload {
  /** Subject = userId interne (UUID). */
  sub: string;
  /** Rôle effectif (un seul, pas un array — PROMPT 3.2 §RBAC). */
  role: UserRole;
  /** MFA validée pour cette session ? */
  mfa: boolean;
  /** Email (non-PII ici car déjà vérifié à la création du compte). */
  email?: string;
  /** Identifiant Keycloak associé (pour le SSO inverse). */
  kcSub?: string;
  /**
   * NINA du citoyen propriétaire — présent UNIQUEMENT pour les tokens citoyen
   * (anti-IDOR `NinaOwnershipGuard` côté identity-service). Absent pour les
   * rôles internes (agent/admin/auditor/…).
   */
  nina?: string;
  /** Issuer et audience contrôlés par les Guards. */
  iss: string;
  /** Audience(s) — émise(s) en tableau (cf. JwtCryptoService), reçue(s) en `string | string[]`. */
  aud: string | string[];
  iat: number;
  exp: number;
}

/** Payload du refresh token (RS256, TTL 7 j, rotation à chaque usage). */
export interface JwtRefreshPayload {
  sub: string;
  role: UserRole;
  /** `jti` unique → clé Redis pour révoquer en O(1). */
  jti: string;
  /** Identifiant de famille — toute rotation conserve le même family ; un rejeu de jti
   *  déjà consommé révoque la famille entière. */
  family: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

/** Payload du token de reset password (RS256, TTL 15 min, usage unique via Redis jti). */
export interface JwtResetPayload {
  sub: string;
  /** Toujours `password-reset` — discrimine vs access/refresh. */
  purpose: 'password-reset';
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

/**
 * Payload du token de challenge MFA (RS256, TTL 5 min, usage unique).
 *
 * Émis par `/auth/login` quand le rôle exige MFA — le client le présente
 * aux endpoints `/auth/mfa/{totp,sms}/verify` pour obtenir une session complète.
 */
export interface JwtMfaChallengePayload {
  sub: string;
  purpose: 'mfa-challenge';
  jti: string;
  role: UserRole;
  /** kcSub propagé pour le claim final de l'access token. */
  kcSub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

/** Projection user attachée à `request.user` après JwtAuthGuard. */
export interface AuthSubject {
  userId: string;
  role: UserRole;
  mfa: boolean;
  email?: string;
}
