/**
 * @file        request-user.ts
 * @description Type LOCAL du sujet authentifié attaché à `request.user`.
 *
 *              `@nina-aes/auth-guards#AuthSubject` est volontairement minimal
 *              (type-only, ADR-027) et n'expose PAS le claim `nina`. Le
 *              document-service en a besoin pour le contrôle d'ownership
 *              anti-IDOR (A01) du download presigné : on étend donc localement
 *              `AuthSubject` avec le `nina` du citoyen propriétaire (absent pour
 *              les rôles agent/admin).
 *
 * @module      document-service/auth
 */
import type { AuthSubject } from '@nina-aes/auth-guards';

/**
 * Sujet authentifié projeté par {@link JwksJwtVerifier}, enrichi du claim
 * `nina`. Réutilisé partout où l'on consomme `request.user`.
 */
export interface AuthSubjectWithNina extends AuthSubject {
  /** NINA du citoyen propriétaire (claim `nina`) — absent pour agent/admin. */
  nina?: string;
}
