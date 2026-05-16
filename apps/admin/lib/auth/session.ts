/**
 * @file        session.ts
 * @description Wrapper léger autour de `@nina-aes/auth` pour apps/admin.
 *              Config client `nina-admin`, mock = agent CTDEC fictif
 *              « Modibo Konaté » + helper `requireRole`.
 *
 * @module      @nina-aes/admin
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

/** Rôles métier admin (sous-ensemble de Role pour API typée). */
export type AdminRole = Extract<Role, 'AGENT' | 'SUPERVISOR' | 'AUDITOR' | 'ADMIN'>;

/** Mock agent — Modibo Konaté, CTDEC Bamako, AGENT + SUPERVISOR. */
const MOCK_AGENT: UserProfile = {
  id: 'mock-agent-001',
  email: 'modibo.konate@ctdec.ml',
  name: 'Modibo Konaté',
  nina: null,
  matricule: 'CTDEC-2024-0156',
  centerId: 'ctdec-bamako',
  roles: ['AGENT', 'SUPERVISOR'],
  locale: 'fr',
};

const AUTH_CONFIG: AuthConfig = {
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'nina-admin',
  appPublicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:4002',
  defaultNext: '/dashboard',
  mockProfile: MOCK_AGENT,
};

export type { Session, UserProfile };

export const getSession = () => _getSession(AUTH_CONFIG);
export const requireSession = () => _requireSession(AUTH_CONFIG);
export const hasRole = (roles: AdminRole[]) => _hasRole(AUTH_CONFIG, roles);
export const requireRole = (roles: AdminRole[]) => _requireRole(AUTH_CONFIG, roles);

/** Type alias pour rétro-compat — `AgentProfile` était l'ancien nom. */
export type AgentProfile = UserProfile;

/** Config exposée pour les route handlers (cf. app/api/auth/*). */
export { AUTH_CONFIG };
