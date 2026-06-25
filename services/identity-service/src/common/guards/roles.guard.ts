/**
 * @file        roles.guard.ts (SHIM de compatibilité — DÉPRÉCIÉ)
 * @description ⚠️ DÉPRÉCIÉ. L'ancien guard combiné « auth + RBAC » de ce fichier
 *              était FAIL-OPEN (route sans `@Roles()` ⇒ ouverte) et exposait un
 *              bypass total `NINA_AUTH_MODE=mock` même en production — le trou
 *              d'autorisation P0 du THREAT-MODEL / doc 07 §3.3.
 *
 *              L'authentification réelle (RS256/JWKS) et le RBAC vivent désormais
 *              dans `src/auth/guards/` :
 *                - {@link JwtAuthGuard}        — authentification fail-closed
 *                - {@link RolesGuard}          — autorisation par rôle
 *                - {@link NinaOwnershipGuard}  — anti-IDOR (ownership NINA)
 *
 *              Ce fichier ne ré-exporte plus QUE le nouveau `RolesGuard` afin de
 *              ne casser aucun import existant. Migrer les imports vers
 *              `../../auth/guards` puis supprimer ce shim.
 *
 * @module      identity-service/common
 */

export { RolesGuard } from '../../auth/guards/roles.guard';
