/**
 * @file        index.ts
 * @description Point d'entrée de `@nina-aes/auth-guards`.
 *
 *              Le package fournit aux microservices NINA-AES les Guards
 *              NestJS et décorateurs nécessaires pour valider les access
 *              tokens RS256 émis par `auth-service`.
 *
 *              Wiring type (dans un microservice consommateur) :
 *              ```ts
 *              @Module({
 *                providers: [
 *                  { provide: JWT_VERIFIER, useExisting: MonJwtVerifierService },
 *                  { provide: APP_GUARD, useClass: JwtAuthGuard },
 *                  { provide: APP_GUARD, useClass: RolesGuard },
 *                  { provide: APP_GUARD, useClass: MfaGuard },
 *                ],
 *              })
 *              ```
 *
 *              L'ordre des guards globaux est garanti par l'ordre de
 *              déclaration dans le tableau `providers` (NestJS 11+).
 *
 * @module      @nina-aes/auth-guards
 */

export * from './types.js';
export * from './decorators/public.decorator.js';
export * from './decorators/roles.decorator.js';
export * from './decorators/require-mfa.decorator.js';
export * from './guards/jwt-auth.guard.js';
export * from './guards/roles.guard.js';
export * from './guards/mfa.guard.js';

/** Version exportée pour debug / health-check. */
export const AUTH_GUARDS_PACKAGE_VERSION = '0.1.0';
