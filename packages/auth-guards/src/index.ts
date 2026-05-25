/**
 * @file        index.ts
 * @description Point d'entrée du package `@nina-aes/auth-guards`.
 *
 *              Ce package fournit aux microservices NINA-AES les Guards NestJS
 *              et décorateurs nécessaires pour valider les JWT RS256 émis par
 *              `auth-service` (port 3002) :
 *
 *                - {@link JwtAuthGuard}   — vérifie le Bearer token via JWKS Keycloak
 *                - {@link RolesGuard}     — RBAC (couplé au décorateur @Roles)
 *                - {@link MfaGuard}       — exige `mfa: true` dans le claim
 *                - @Roles(...roles)       — déclare les rôles autorisés
 *                - @RequireMfa()          — exige MFA validée
 *                - @Public()              — bypass JwtAuthGuard
 *
 *              Stub Phase 1 — les Guards seront implémentés en Phase 3.
 *
 * @module      @nina-aes/auth-guards
 */

// Phase 3 : exporter ici les guards/décorateurs effectifs.
// Marqueur pour que le package soit résolvable par pnpm dès Phase 1.
export const AUTH_GUARDS_PACKAGE_VERSION = '0.1.0';
