/**
 * @file        types.ts
 * @description Types et tokens d'injection partagés par les Guards NestJS.
 *
 *              Le package `@nina-aes/auth-guards` est volontairement découplé :
 *              il ne dépend ni de Vault, ni de Redis, ni de `auth-service`.
 *              Chaque microservice consommateur fournit son propre
 *              {@link JwtVerifier} via le token DI {@link JWT_VERIFIER}.
 *
 *                - `auth-service` : injecte son `JwtCryptoService` (clé Vault).
 *                - autres services : injectent un verifier basé sur JWKS
 *                  (Keycloak ou auth-service `/.well-known/jwks.json`).
 *
 * @module      @nina-aes/auth-guards
 */

/**
 * Projection minimale attachée à `request.user` par {@link JwtAuthGuard}.
 *
 * `role` est une string libre — chaque service la confronte aux valeurs
 * définies par {@link UserRole} (ou son équivalent applicatif).
 */
export interface AuthSubject {
  userId: string;
  role: string;
  mfa: boolean;
  email?: string;
  kcSub?: string;
  /**
   * NINA du citoyen — présent dans les tokens de rôle `citizen` (émis par
   * auth-service). Permet aux services d'offrir des routes **self-service**
   * scopées au citoyen (ex. `POST /appointments/me`) sans qu'un `citizenId`
   * soit fourni par le client : l'identité vient du token (anti-IDOR).
   */
  nina?: string;
}

/**
 * Contrat que doit implémenter le verifier injecté par chaque service.
 *
 * En cas de token invalide / expiré / mal signé, l'implémentation DOIT
 * lever (typiquement `UnauthorizedException`). Le Guard ne doit pas avoir
 * à distinguer les sous-cas — la stratégie « générique » empêche
 * l'oracle user-enum.
 */
export interface JwtVerifier {
  verifyAccess(token: string): AuthSubject;
}

/** Token d'injection NestJS pour le verifier. */
export const JWT_VERIFIER = Symbol('NINA_AES_JWT_VERIFIER');

/**
 * Liste canonique des rôles NINA-AES (matchant les claims `role` émis par
 * `auth-service`). Exportée pour ergonomie ; les Guards travaillent
 * néanmoins sur des `string[]` pour rester découplés de cette enum.
 */
export enum UserRole {
  CITIZEN = 'citizen',
  AGENT = 'agent',
  SUPERVISOR = 'supervisor',
  ADMIN = 'admin',
  AUDITOR = 'auditor',
  ANTICORRUPTION_INSPECTOR = 'anticorruption_inspector',
}
