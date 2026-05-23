/**
 * @file        index.ts
 * @description Point d'entrée du package `@nina-aes/auth`.
 *
 *              Usage typique côté app (ex: apps/citizen) :
 *
 *                // lib/auth.ts
 *                import { getSession, requireSession, requireRole } from '@nina-aes/auth';
 *                const AUTH_CONFIG = {
 *                  clientId: 'nina-citizen',
 *                  appPublicUrl: process.env.APP_PUBLIC_URL!,
 *                  defaultNext: '/dashboard',
 *                  mockProfile: { ... },
 *                };
 *                export const getMySession = () => getSession(AUTH_CONFIG);
 *                ...
 *
 *                // app/api/auth/login/route.ts
 *                import { buildLoginHandler } from '@nina-aes/auth';
 *                export const GET = buildLoginHandler(AUTH_CONFIG);
 *
 * @module      @nina-aes/auth
 */

export type { Role, UserProfile, Session, AuthMode, AuthConfig } from './types';
export { getSession, requireSession, requireRole, hasRole, isOwnerOf } from './session';
export { buildLoginHandler } from './handlers/login';
export { buildCallbackHandler } from './handlers/callback';
export { buildRefreshHandler } from './handlers/refresh';
export { buildLogoutHandler } from './handlers/logout';
