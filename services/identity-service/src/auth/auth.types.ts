/**
 * @file        auth.types.ts
 * @description Contrats d'authentification LOCAUX à identity-service.
 *
 *              Pourquoi locaux et non importés de `@nina-aes/auth-guards` :
 *              ce service ne déclare pas (encore) `@nina-aes/auth-guards` dans
 *              ses dépendances et son `node_modules` ne le résout pas. Conforme
 *              à l'esprit d'ADR-027 (les CLASSES `@Injectable()` vivent dans le
 *              service ; ici on garde aussi les contrats locaux pour rester
 *              autoportant et ne casser ni le build ni le lint). La forme
 *              `AuthSubject`/`JwtVerifier`/`JWT_VERIFIER` reste alignée sur le
 *              package partagé pour une migration triviale ultérieure.
 *
 * @module      identity-service/auth
 */

/**
 * Projection minimale du sujet authentifié, attachée à `request.user` par le
 * {@link JwtAuthGuard}. `role` est une string libre (comparée sans casse au
 * RBAC) ; `nina` (claim du token citoyen) sert au contrôle d'ownership.
 */
export interface AuthSubject {
  /** Identifiant utilisateur (`sub` du JWT). */
  userId: string;
  /** Rôle applicatif (citizen, agent, supervisor, admin, …). */
  role: string;
  /** L'utilisateur a-t-il satisfait la MFA. */
  mfa: boolean;
  /** Courriel, si présent dans le token. */
  email?: string;
  /** NINA du citoyen propriétaire (absent pour agent/admin) — anti-IDOR. */
  nina?: string;
}

/**
 * Contrat du vérificateur de token injecté dans le {@link JwtAuthGuard}.
 *
 * En cas de token invalide / expiré / mal signé, l'implémentation DOIT lever
 * (typiquement `UnauthorizedException`) avec un message GÉNÉRIQUE (anti-oracle).
 */
export interface JwtVerifier {
  /**
   * Vérifie un access token et renvoie le sujet authentifié.
   *
   * @param token JWT compact (sans préfixe `Bearer `).
   * @returns Sujet authentifié.
   * @throws UnauthorizedException si le token est invalide/expiré/mal signé.
   */
  verifyAccess(token: string): AuthSubject;
}

/** Token d'injection NestJS pour le vérificateur (découple Guard ↔ impl). */
export const JWT_VERIFIER = Symbol('IDENTITY_JWT_VERIFIER');
