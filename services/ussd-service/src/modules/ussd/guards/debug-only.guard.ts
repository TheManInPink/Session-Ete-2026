/**
 * @file        debug-only.guard.ts
 * @description Garde l'endpoint de debug `GET /api/v1/ussd/sessions/:id`
 *              (doc 14 §6 « Pièges courants » — IDOR).
 *
 *              PROBLÈME (IDOR — OWASP A01:2021) : cet endpoint exposait l'état
 *              d'une session (state / language / timestamps) à partir d'un
 *              `sessionId` DEVINÉ, sans aucune authentification. C'est une
 *              lecture d'état non autorisée (Insecure Direct Object Reference).
 *
 *              DÉCISION : ussd-service est un MVP SANS infrastructure JWT/RBAC
 *              (pas d'AuthModule, contrairement à identity-service). Plutôt
 *              qu'importer toute la chaîne de vérification RS256/JWKS pour un
 *              simple endpoint de debug, on applique la 2ᵉ option proposée par
 *              la doc : DÉSACTIVER la route HORS développement (fail-closed).
 *
 *              ⏳ CIBLE : remplacer par `@UseGuards(JwtAuthGuard + RolesGuard)`
 *              restreint au rôle ADMIN le jour où ussd-service intègre l'auth.
 *
 * @module      ussd-service/ussd/guards
 */

import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class DebugOnlyGuard implements CanActivate {
  /** Hors développement (staging / production), l'endpoint est interdit. */
  private readonly isDevelopment = (process.env.NODE_ENV ?? 'development') === 'development';

  /**
   * Autorise l'accès uniquement en environnement de développement.
   *
   * @returns `true` en dev.
   * @throws ForbiddenException (403) hors dev — aucune lecture d'état possible.
   */
  canActivate(): boolean {
    if (!this.isDevelopment) {
      throw new ForbiddenException('Endpoint de debug désactivé hors développement');
    }
    return true;
  }
}
