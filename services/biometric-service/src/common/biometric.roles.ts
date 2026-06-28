/**
 * @file        biometric.roles.ts
 * @description Rôles RBAC propres à la biométrie. L'enum `UserRole` de
 *              `@nina-aes/auth-guards` ne porte PAS de rôle biométrie dédié ; les
 *              guards travaillent sur des `string[]`, on déclare donc ici les
 *              constantes canoniques (minuscules, alignées sur le format des
 *              claims `role` émis par auth-service) consommées par `@Roles(...)`.
 *
 *                - `BIOMETRIC_OPERATOR` : enrôlement + vérification 1:1 (P3a/b).
 *                - `INSPECTOR`          : recherche 1:N restreinte (P3c) — mandat
 *                  judiciaire + double validation procureur (4-yeux, DPIA §3.4).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/common
 */

/** Rôles biométrie (claims `role` minuscules — cf. `@nina-aes/auth-guards`). */
export const BiometricRole = {
  /** Agent habilité à l'enrôlement et à la vérification 1:1. */
  BIOMETRIC_OPERATOR: 'biometric_operator',
  /** Inspecteur habilité au 1:N restreint (P3c, 4-yeux). */
  INSPECTOR: 'inspector',
} as const;
export type BiometricRole = (typeof BiometricRole)[keyof typeof BiometricRole];
