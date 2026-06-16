/**
 * @file        session.ts
 * @description Wrapper léger autour de `@nina-aes/auth` pour apps/governance.
 *              Config client `nina-governance`, mock = haut fonctionnaire fictif
 *              « Général Issa Ousmane Coulibaly » (Ministère de l'Intérieur) + helper requireRole.
 *
 *              Le portail gouvernance est réservé aux rôles SUPERVISOR / ADMIN.
 *
 * @module      @nina-aes/governance
 */

import {
  getSession as _getSession,
  requireSession as _requireSession,
  requireRole as _requireRole,
  hasRole as _hasRole,
  type AuthConfig,
  type Role,
  type Session,
  type UserProfile,
} from '@nina-aes/auth';

/** Rôles autorisés sur le portail gouvernance. */
export type GovernanceRole = Extract<Role, 'SUPERVISOR' | 'ADMIN'>;

/** Mock haut fonctionnaire — Général Issa Ousmane Coulibaly, Ministère de l'Intérieur. */
const MOCK_OFFICIAL: UserProfile = {
  id: 'mock-gov-001',
  email: 'issa.ousmane.coulibaly@interieur.gov.ml',
  name: 'Général Issa Ousmane Coulibaly',
  nina: null,
  matricule: 'MININT-2024-0042',
  centerId: "Ministère de l'Intérieur",
  roles: ['SUPERVISOR', 'ADMIN'],
  locale: 'fr',
};

const AUTH_CONFIG: AuthConfig = {
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'nina-governance',
  appPublicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:4003',
  defaultNext: '/messagerie',
  mockProfile: MOCK_OFFICIAL,
};

export type { Session, UserProfile };

export const getSession = () => _getSession(AUTH_CONFIG);
export const requireSession = () => _requireSession(AUTH_CONFIG);
export const hasRole = (roles: GovernanceRole[]) => _hasRole(AUTH_CONFIG, roles);
export const requireRole = (roles: GovernanceRole[]) => _requireRole(AUTH_CONFIG, roles);

/** Config exposée pour les route handlers (cf. app/api/auth/*). */
export { AUTH_CONFIG };
