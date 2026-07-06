/**
 * @file        consent.service.ts
 * @description Cœur métier du CONSENTEMENT biométrique (base légale opérationnelle
 *              du traitement — DPIA §2). Trois responsabilités :
 *                1) VÉRIFIER + PERSISTER une preuve de consentement signée (JWS
 *                   Ed25519 ancré) — anti-rejeu par `jti` unique. Réutilisé par le
 *                   module enrollment (consentement requis pour enrôler).
 *                2) RÉSOUDRE un consentement actif pour un citoyen+scope (garde).
 *                3) RÉVOQUER le consentement (droit de retrait) → déclenche le
 *                   DROIT À L'EFFACEMENT (hard delete des templates + purge index
 *                   ANN à venir, doc 25 §6 / DPIA §5).
 *
 *              CANON : aucune image, aucun template, aucun paramètre, aucun NINA
 *              en clair dans les traces. Le JWS de consentement est conservé comme
 *              PREUVE (vérifiable a posteriori).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/consent
 */
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import type { BioAuthSubject } from '../auth/auth.types.js';
import { ConsentRepository } from './consent.repository.js';
import { ConsentVerifier, type VerifiedConsent } from './consent.verifier.js';
import type { RevokeConsentDto, VerifyConsentDto } from './dto/consent.schema.js';

/** Vue publique d'un consentement enregistré (jamais le JWS dans la liste). */
export interface ConsentView {
  citizenId: string;
  jti: string;
  scope: string;
  channel: string;
  lang: string;
  expiresAt: string;
}

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(
    private readonly verifier: ConsentVerifier,
    private readonly repo: ConsentRepository,
    private readonly audit: AuditPublisher,
  ) {}

  /**
   * Vérifie un JWS de consentement contre la clé ancrée du citoyen, puis le
   * persiste comme preuve (anti-rejeu par `jti`). Trace DURABLE avant retour.
   *
   * @param dto   Corps validé (citizenId + JWS).
   * @param actor Agent authentifié (traçabilité — il ne SIGNE jamais).
   * @param ip    IP source (audit).
   */
  async verifyAndPersist(
    dto: VerifyConsentDto,
    actor: BioAuthSubject,
    ip?: string | null,
  ): Promise<ConsentView> {
    // 0) Citoyen existant (anti-IDOR : pas de consentement pour un inconnu).
    const citizen = await this.repo.findCitizen(dto.citizenId);
    if (!citizen) throw new NotFoundException('Citoyen introuvable');

    // 1) Chaîne de confiance : signature + ancrage + claims + anti-rejeu/révocation.
    const verified = await this.verifier.verify(dto.consentJws, dto.citizenId);

    // 2) Persistance de la preuve (le jti unique scelle l'anti-rejeu en base).
    await this.repo.create({
      citizenId: dto.citizenId,
      jti: verified.jti,
      signerKid: verified.signerKid,
      scope: verified.scope,
      channel: verified.channel,
      lang: verified.lang,
      consentJws: dto.consentJws,
      issuedAt: verified.issuedAt,
      expiresAt: verified.expiresAt,
    });

    // 3) AUDIT DURABLE (fail-closed) — opération sensible.
    await this.audit.recordAccess({
      action: AuditAction.CONSENT_VERIFIED,
      entityType: 'BiometricConsent',
      entityId: dto.citizenId,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: {
        consentJti: verified.jti,
        signerKid: verified.signerKid,
        scope: verified.scope,
        channel: verified.channel,
        lang: verified.lang,
        result: 'ACCEPTED',
      },
    });

    return this.toView(dto.citizenId, verified);
  }

  /**
   * Garde réutilisée par l'enrôlement : exige un consentement actif couvrant le
   * `scope` demandé pour CE citoyen, ET CONSOMME un crédit d'enrôlement (liaison
   * per-opération). Lève 403 si aucun crédit disponible (absent / expiré /
   * révoqué / scope différent / plafond `maxEnrollments` atteint).
   *
   * ⚠️  CONSOMMATION (anti-réutilisation illimitée) — un seul JWS ne doit PAS
   * autoriser des enrôlements illimités jusqu'à `exp` : on consomme ATOMIQUEMENT
   * un crédit (`enrollmentsUsed++` borné par `maxEnrollments`, single-use par
   * défaut). La consommation atomique ferme la course concurrente.
   *
   * @param citizenId Citoyen ciblé.
   * @param scope     Périmètre requis (ex. `enroll:FINGERPRINT`).
   * @returns Le consentement consommé (signerKid/jti pour ancrer le template).
   * @throws ForbiddenException si aucun crédit de consentement disponible.
   */
  async assertActiveConsent(
    citizenId: string,
    scope: string,
  ): Promise<{ signerKid: string; jti: string }> {
    const consumed = await this.repo.consumeForEnrollment(citizenId, scope);
    if (!consumed) {
      throw new ForbiddenException('CONSENT_REQUIRED');
    }
    return consumed;
  }

  /**
   * Garde du MATCHING (verify 1:1 / identify) : le citoyen a-t-il encore un
   * consentement ACTIF (non révoqué, non expiré) ? Le RETRAIT du consentement
   * DOIT interdire tout nouvel appariement, MÊME si les templates ne sont pas
   * encore physiquement effacés (effacement asynchrone / échec partiel — DPIA §5,
   * doc 25 §6). Lecture non-levante : l'appelant décide de la trace/refus de façon
   * UNIFORME (pas d'oracle d'énumération du statut d'enrôlement).
   *
   * @param citizenId Citoyen ciblé.
   * @returns `true` si l'appariement biométrique est autorisé.
   */
  hasActiveMatchingConsent(citizenId: string): Promise<boolean> {
    return this.repo.hasActiveConsent(citizenId);
  }

  /**
   * Révoque le consentement d'un citoyen et DÉCLENCHE le droit à l'effacement
   * (hard delete des templates). Trace DURABLE avant retour.
   *
   * @param dto   Corps validé (citizenId + motif).
   * @param actor Acteur authentifié.
   * @param ip    IP source (audit).
   */
  async revoke(
    dto: RevokeConsentDto,
    actor: BioAuthSubject,
    ip?: string | null,
  ): Promise<{ citizenId: string; consentsRevoked: number; templatesErased: number }> {
    const citizen = await this.repo.findCitizen(dto.citizenId);
    if (!citizen) throw new NotFoundException('Citoyen introuvable');

    // 1+2) ATOMIQUE : révocation des consentements ET effacement des templates dans
    //       UNE SEULE transaction. Sans cela, un échec du hard delete après la
    //       révocation laisserait le consentement révoqué mais les templates encore
    //       matchables (échec partiel). Le gate de matching refuse de toute façon
    //       dès la révocation (`hasActiveMatchingConsent`), mais l'atomicité garantit
    //       que révocation et effacement réussissent/échouent ENSEMBLE (DPIA §5).
    const { consentsRevoked, templatesErased } = await this.repo.revokeAndEraseForCitizen(
      dto.citizenId,
    );

    // 3) AUDIT DURABLE (fail-closed).
    await this.audit.recordAccess({
      action: AuditAction.CONSENT_REVOKED,
      entityType: 'BiometricConsent',
      entityId: dto.citizenId,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { reason: dto.reason, consentsRevoked, templatesErased },
    });
    await this.audit.publish({
      action: AuditAction.TEMPLATES_ERASED,
      entityType: 'BiometricTemplate',
      entityId: dto.citizenId,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { templatesErased },
    });

    this.logger.log(
      `Consentement révoqué pour ${dto.citizenId} : ${consentsRevoked} consentements, ${templatesErased} templates effacés.`,
    );
    return { citizenId: dto.citizenId, consentsRevoked, templatesErased };
  }

  /** Projette un consentement vérifié en vue publique (jamais le JWS). */
  private toView(citizenId: string, v: VerifiedConsent): ConsentView {
    return {
      citizenId,
      jti: v.jti,
      scope: v.scope,
      channel: v.channel,
      lang: v.lang,
      expiresAt: v.expiresAt.toISOString(),
    };
  }
}
