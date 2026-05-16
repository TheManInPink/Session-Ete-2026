/**
 * @file        session.ts
 * @description Wrapper léger autour de `@nina-aes/auth` pour apps/citizen.
 *              Définit la config d'auth de cette app (client `nina-citizen`,
 *              mock = Fatoumata Diallo) et ré-expose les helpers de session
 *              déjà partiellement appliqués (sans avoir à repasser
 *              `AUTH_CONFIG` à chaque appel).
 *
 *              Pattern miroir d'`apps/admin/lib/auth/session.ts`.
 *
 * @module      @nina-aes/citizen
 */

import {
  getSession as _getSession,
  requireSession as _requireSession,
  hasRole as _hasRole,
  isOwnerOf as _isOwnerOf,
  type AuthConfig,
  type Role,
  type Session,
  type UserProfile,
} from '@nina-aes/auth';

/** Mock citoyen — Fatoumata Diallo, NINA fictif **valide** (la lettre de
 *  contrôle V est dérivée des 14 chiffres via `validateNina()`). L'ancien
 *  `...Z` était incorrect — il déclenchait isOwnerOf=false sur toutes les
 *  routes vérifiant l'ownership (wizard correction notamment). */
const MOCK_CITIZEN: UserProfile = {
  id: 'mock-citizen-001',
  email: 'fatoumata.diallo@nina-aes.demo',
  name: 'Fatoumata Diallo',
  nina: '18903102015042V',
  matricule: null,
  centerId: null,
  roles: ['CITIZEN'],
  locale: 'fr',
};

const AUTH_CONFIG: AuthConfig = {
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'nina-citizen',
  appPublicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:4001',
  defaultNext: '/dashboard',
  mockProfile: MOCK_CITIZEN,
};

export type { Session, UserProfile, Role };

export const getSession = () => _getSession(AUTH_CONFIG);
export const requireSession = () => _requireSession(AUTH_CONFIG);
export const hasRole = (roles: Role[]) => _hasRole(AUTH_CONFIG, roles);
export const isOwnerOf = (nina: string) => _isOwnerOf(AUTH_CONFIG, nina);

/** Booléen — vrai si la session est un agent CTDEC ou supérieur. */
export const isAgent = () =>
  _hasRole(AUTH_CONFIG, ['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);

/** Config exposée pour les route handlers (cf. app/api/auth/*). */
export { AUTH_CONFIG };
