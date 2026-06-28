/**
 * @file        auth.types.ts
 * @description Projection locale du sujet authentifié pour le governance-service.
 *              Les messages SGOGT et l'export électoral sont INSTITUTIONNELS :
 *              aucun claim `nina` (pas de citoyen ici). On expose seulement
 *              l'identité du fonctionnaire (`userId` = sub JWT) et son rôle RBAC.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/auth
 */
import type { AuthSubject } from '@nina-aes/auth-guards';

/**
 * Sujet authentifié du governance-service. Strictement institutionnel : pas de
 * NINA, pas de lien citoyen. `userId` est le `sub` du JWT (résolu en `User.id`
 * interne au besoin par les repositories).
 */
export type GovAuthSubject = AuthSubject;
