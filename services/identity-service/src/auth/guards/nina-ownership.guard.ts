/**
 * @file        nina-ownership.guard.ts
 * @description Guard de PROPRIÉTÉ (ownership) — anti-IDOR (OWASP A01:2021).
 *              Empêche un citoyen de consulter le NINA d'un AUTRE citoyen.
 *
 *              Règle :
 *                - rôles privilégiés (agent/supervisor/admin/auditor) : accès
 *                  transverse légitime (besoin métier, audité côté audit-service) ;
 *                - rôle citizen : il ne peut lire QUE son propre NINA — le `:nina`
 *                  de la route DOIT être STRICTEMENT égal au claim `nina` de son
 *                  token (comparaison normalisée).
 *
 *              ⚠️ Anti-bypass : aucune précédence d'opérateur piégeuse. On
 *              REFUSE par défaut (fail-closed) et on n'autorise QUE sur égalité
 *              explicite. Doit s'exécuter APRÈS {@link JwtAuthGuard}.
 *
 *              ⚠️ Classe LOCALE au service (ADR-027).
 *
 * @module      identity-service/auth/guards
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { normalizeNina } from '@nina-aes/utils';
import type { Request } from 'express';

import type { RequestUser } from './jwt-auth.guard';

@Injectable()
export class NinaOwnershipGuard implements CanActivate {
  /** Rôles autorisés à consulter le NINA d'autrui (comparés en minuscules). */
  private static readonly PRIVILEGED = new Set(['agent', 'supervisor', 'admin', 'auditor']);

  /**
   * @param context Contexte d'exécution Nest.
   * @returns `true` si l'appelant est privilégié OU consulte son propre NINA.
   * @throws ForbiddenException (403) sinon — message générique (on ne confirme
   *         PAS l'existence du NINA visé).
   */
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser; params: Record<string, string> }>();

    const user = req.user;
    if (!user) {
      // Ne devrait pas arriver (JwtAuthGuard passe avant) — refus par défaut.
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }

    // Rôles privilégiés : accès transverse (audité ailleurs).
    if (NinaOwnershipGuard.PRIVILEGED.has(String(user.role).toLowerCase())) {
      return true;
    }

    // Citoyen : il ne peut lire QUE son propre NINA.
    const requestedNina = req.params['nina'];
    if (!user.nina || !requestedNina) {
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }
    if (normalizeNina(user.nina) !== normalizeNina(requestedNina)) {
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }
    return true;
  }
}
