/**
 * @file        index.ts
 * @description Barrel des guards locaux d'auth-service. Voir ADR-027 pour
 *              le rationale (pas de classes Nest partagées via workspace).
 */
export * from './jwt-auth.guard.js';
export * from './roles.guard.js';
export * from './mfa.guard.js';
