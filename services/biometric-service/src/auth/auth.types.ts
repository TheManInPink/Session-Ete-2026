/**
 * @file        auth.types.ts
 * @description Projection locale du sujet authentifié. Étend l'`AuthSubject`
 *              partagé (`@nina-aes/auth-guards`). En biométrie, les opérations
 *              sont réalisées par des AGENTS (rôle `biometric_operator`, ou
 *              `inspector` pour le 1:N), jamais par le citoyen lui-même : il n'y a
 *              donc PAS d'anti-IDOR « par claim nina côté token » comme dans le
 *              vulnerability-service. L'anti-IDOR biométrie repose sur :
 *                - `/register` : le `citizenId` est LIÉ au consentement JWS ancré
 *                  (le `sub` du JWS == citizenId), pas un paramètre libre ;
 *                - `/verify`   : motif tracé + habilitation par `citizenId`
 *                  (un agent ne vérifie pas un citoyen arbitraire sans raison).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/auth
 */
import type { AuthSubject } from '@nina-aes/auth-guards';

/**
 * Sujet authentifié biométrie. `nina` (NINA propriétaire) reste possible si un
 * citoyen s'authentifie pour révoquer son consentement, mais le chemin nominal
 * d'enrôlement/vérification est porté par un agent (sans `nina`).
 */
export interface BioAuthSubject extends AuthSubject {
  /** NINA propriétaire (citoyens uniquement) — anti-IDOR sur la révocation. */
  nina?: string;
}
