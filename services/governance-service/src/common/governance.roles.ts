/**
 * @file        governance.roles.ts
 * @description Rôles RBAC institutionnels du governance-service.
 *
 *              Les claims `role` émis par auth-service sont en minuscules (cf.
 *              `@nina-aes/auth-guards`). Le SGOGT et l'export électoral sont des
 *              actes administratifs : on travaille avec des rôles institutionnels
 *              dédiés (`official`, `director`, `dge_official`) en plus des rôles
 *              applicatifs partagés (`supervisor`, `admin`).
 *
 *              ⚠️ La garde RBAC (`RolesGuard`) compare en minuscules des deux
 *              côtés ; on déclare donc ici la forme canonique minuscule.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/common
 */

/**
 * Rôles habilités à la messagerie SGOGT (envoi/lecture/directives). Un agent
 * standard (`agent`) n'émet pas de décision administrative engageante.
 */
export const GovRole = {
  /** Fonctionnaire émetteur/destinataire de décisions SGOGT. */
  OFFICIAL: 'official',
  /** Superviseur hiérarchique (rôle applicatif partagé). */
  SUPERVISOR: 'supervisor',
  /** Directeur (sommet d'escalade institutionnel). */
  DIRECTOR: 'director',
  /** Administrateur plateforme (rôle applicatif partagé). */
  ADMIN: 'admin',
  /** Auditeur lecture seule (rôle applicatif partagé). */
  AUDITOR: 'auditor',
  /** Agent DGE — SEUL rôle habilité à l'export électoral (anti-IDOR A01). */
  DGE_OFFICIAL: 'dge_official',
} as const;

export type GovRole = (typeof GovRole)[keyof typeof GovRole];

/** Rôles autorisés à émettre/recevoir des messages et directives SGOGT. */
export const SGOGT_ROLES: readonly string[] = [
  GovRole.OFFICIAL,
  GovRole.SUPERVISOR,
  GovRole.DIRECTOR,
  GovRole.ADMIN,
];
