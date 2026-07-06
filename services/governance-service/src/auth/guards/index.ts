/**
 * @file        index.ts
 * @description Barrel des guards locaux (JwtAuthGuard, RolesGuard). ADR-027 :
 *              les guards vivent dans le service (pas dans un package partagé).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/auth/guards
 */
export { JwtAuthGuard } from './jwt-auth.guard.js';
export { RolesGuard } from './roles.guard.js';
