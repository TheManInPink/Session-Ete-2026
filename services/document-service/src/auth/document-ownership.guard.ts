/**
 * @file        document-ownership.guard.ts
 * @description Décision d'ownership (anti-IDOR — OWASP A01:2021) appliquée au
 *              téléchargement d'une FDI. Empêche un CITOYEN de pré-signer /
 *              télécharger la Fiche Descriptive d'un AUTRE citoyen en devinant
 *              l'UUID du Document.
 *
 *              Règle (fail-closed, aucune précédence d'opérateur piégeuse) :
 *                - rôles privilégiés (agent/supervisor/admin/auditor) : accès
 *                  transverse légitime (besoin métier, audité côté audit-service) ;
 *                - rôle citizen : il ne peut accéder QU'À un Document dont le
 *                  `nina` est STRICTEMENT égal au claim `nina` de son token
 *                  (comparaison normalisée via {@link normalizeNina}).
 *
 *              ⚠️ Contrairement à `NinaOwnershipGuard` d'identity-service (qui
 *              compare un `:nina` de route), ici l'identifiant de route est un
 *              UUID de Document : le `nina` du document doit donc être fourni par
 *              l'appelant APRÈS le chargement Prisma. On modélise donc la
 *              décision en service pur (testable) plutôt qu'en `CanActivate`
 *              (qui n'a pas accès au document chargé). Le contrôleur l'invoque
 *              juste avant toute génération d'URL pré-signée.
 *
 *              ⚠️ Classe LOCALE au service (ADR-027).
 *
 * @module      document-service/auth
 */
import { ForbiddenException, Injectable } from '@nestjs/common';
import { normalizeNina } from '@nina-aes/utils';
import type { AuthSubjectWithNina } from './request-user';

@Injectable()
export class DocumentOwnershipService {
  /** Rôles autorisés à accéder à la FDI d'autrui (comparés en minuscules). */
  private static readonly PRIVILEGED = new Set(['agent', 'supervisor', 'admin', 'auditor']);

  /**
   * Autorise (ou refuse) l'accès d'un appelant à un Document donné.
   *
   * @param user      Sujet authentifié (issu de `request.user`).
   * @param documentNina NINA porté par le Document ciblé (dénormalisé en base).
   * @throws ForbiddenException (403) si l'appelant n'est ni privilégié ni
   *         propriétaire — message générique (on ne confirme PAS l'existence /
   *         la propriété du document ciblé : anti-oracle).
   */
  assertCanAccess(user: AuthSubjectWithNina | undefined, documentNina: string): void {
    if (!user) {
      // Ne devrait pas arriver (JwtAuthGuard passe avant) — refus par défaut.
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }

    // Rôles privilégiés : accès transverse (audité ailleurs).
    if (DocumentOwnershipService.PRIVILEGED.has(String(user.role).toLowerCase())) {
      return;
    }

    // Citoyen : il ne peut accéder QU'À sa propre FDI. On exige les deux NINA
    // et une égalité STRICTE après normalisation (fail-closed).
    if (!user.nina || !documentNina) {
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }
    if (normalizeNina(user.nina) !== normalizeNina(documentNina)) {
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }
  }
}
