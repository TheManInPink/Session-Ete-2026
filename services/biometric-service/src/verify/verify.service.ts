/**
 * @file        verify.service.ts
 * @description Cœur métier de la VÉRIFICATION 1:1 (distance + seuil τ, doc 25
 *              §4.2). Transforme la nouvelle capture avec le MÊME paramètre que
 *              l'enrôlement (par `transform_kid`), puis déclare « match » si
 *              `distance ≤ τ` — JAMAIS par égalité de hash.
 *
 *              ⚠️  ANTI-TIMING (doc 25 §4.3) — la boucle parcourt TOUS les
 *              templates actifs SANS court-circuit au premier succès
 *              (`best_match = best_match || is_match`). On ne sort pas au premier
 *              match : le temps de réponse ne révèle pas QUEL template (ni S'IL) a
 *              matché tôt. Plusieurs kids actifs peuvent coexister pendant une
 *              rotation double-écriture (§4.5) — chacun est transformé avec SON kid.
 *
 *              ⚠️  ANTI-IDOR + MOTIF — `/verify` ne porte PAS de consentement signé
 *              (on ne re-signe pas à chaque vérification) : l'autorisation repose
 *              sur mTLS + JWT + rôle `biometric_operator` + un MOTIF tracé. Sans
 *              motif, pas de vérification (un agent ne vérifie pas un citoyen
 *              arbitraire sans raison).
 *
 *              ⚠️  ANTI-BRUTEFORCE (DPIA §6.5) — FAR ~1e-4 est brute-forçable par
 *              volume : rate-limit par `(agent, citizen)` + verrouillage après N
 *              échecs + alerte SIEM. Sans cela, le seuil τ est contournable.
 *
 *              COHÉRENCE de l'audit — trace ATTRIBUABLE (entityId = citizenId) car
 *              la détection de bruteforce EXIGE de compter les échecs PAR citoyen.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/verify
 */
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { BiometricKind } from '@nina-aes/database';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import type { BioAuthSubject } from '../auth/auth.types.js';
import { CancelableService } from '../cancelable/cancelable.service.js';
import { normalizeFeatureVector } from '../cancelable/feature-extractor.js';
import { withWipe } from '../cancelable/secure-buffer.js';
import { ConsentService } from '../consent/consent.service.js';
import { TemplatesRepository } from '../templates/templates.repository.js';
import type { VerifyFingerprintDto } from './dto/verify.schema.js';
import { FailureTrackerService } from './failure-tracker.service.js';

/** Résultat d'une vérification 1:1 (jamais le template, jamais la distance brute). */
export interface VerifyResult {
  match: boolean;
}

@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);

  constructor(
    private readonly cancelable: CancelableService,
    private readonly templates: TemplatesRepository,
    private readonly failures: FailureTrackerService,
    private readonly consent: ConsentService,
    private readonly audit: AuditPublisher,
  ) {}

  /** Vérifie 1:1 une empreinte (distance ≤ τ, boucle sans court-circuit). */
  verifyFingerprint(
    dto: VerifyFingerprintDto,
    actor: BioAuthSubject,
    ip?: string | null,
  ): Promise<VerifyResult> {
    return this.verify(BiometricKind.FINGERPRINT, dto, actor, ip);
  }

  /** Pipeline de vérification 1:1 commun. */
  private async verify(
    kind: BiometricKind,
    dto: VerifyFingerprintDto,
    actor: BioAuthSubject,
    ip?: string | null,
  ): Promise<VerifyResult> {
    const { citizenId } = dto;

    // 0) ANTI-BRUTEFORCE : refuser si la paire (agent, citizen) est verrouillée
    //    (compteur PARTAGÉ entre réplicas ; fail-closed si store indisponible).
    if (await this.failures.isLocked(actor.userId, citizenId)) {
      await this.audit.recordAccess({
        action: AuditAction.VERIFY_LOCKED,
        entityType: 'BiometricTemplate',
        entityId: citizenId,
        actorId: actor.userId,
        actorType: actor.role,
        ipAddress: ip,
        metadata: { reason: 'lockout_active' },
      });
      throw new ForbiddenException('VERIFY_LOCKED');
    }

    // 1) GATE CONSENTEMENT DU MATCHING. L'appariement biométrique est une
    //    OPÉRATION DE TRAITEMENT à part entière : il EXIGE un consentement ACTIF
    //    (non révoqué, non expiré) — un citoyen ayant RETIRÉ son consentement (ou
    //    n'ayant consenti qu'à l'enrôlement) ne doit PLUS être appariable, MÊME si
    //    ses templates ne sont pas encore physiquement effacés (DPIA §5). On ne
    //    BRANCHE PAS observablement : l'absence de consentement suit EXACTEMENT le
    //    chemin d'un non-match (voir `failVerify`), sans révéler le statut.
    const consentOk = await this.consent.hasActiveMatchingConsent(citizenId);

    // 2) Templates ACTIFS du citoyen (peut y avoir plusieurs kids — rotation).
    //    ⚠️  ANTI-ÉNUMÉRATION (oracle d'enrôlement) — un citoyen SANS template ne
    //    renvoie PAS un 404 distinct : ce serait un oracle (code + timing) qui
    //    laisse un opérateur énumérer QUI est enrôlé. On suit le MÊME chemin que le
    //    non-match (`failVerify`) : `{match:false}` + échec compté + audit.
    const stored = consentOk ? await this.templates.findActiveByCitizen(citizenId, kind) : [];

    // 3) Comparer SANS court-circuit (anti-timing). Si pas de consentement ou pas
    //    de template, la liste est vide → bestMatch = false → chemin de non-match.
    const features = normalizeFeatureVector(dto.featureVector);
    const bestMatch = await withWipe(features, async (f) => {
      let acc = false;
      for (const tpl of stored) {
        const probe = await this.cancelable.protect(f, tpl.transformKid);
        const distance = this.cancelable.distance(probe, new Uint8Array(tpl.protectedTemplate));
        const isMatch = this.cancelable.isMatch(distance, tpl.matchThreshold);
        // Pas de `break` : on agrège sans révéler QUEL template a matché tôt.
        acc = acc || isMatch;
        probe.fill(0);
      }
      return acc;
    });

    // 4) Trace ATTRIBUABLE (entityId = citizenId) — la détection bruteforce EXIGE
    //    de compter les échecs PAR citoyen. On ne duplique PAS le citizenId dans
    //    le payload.
    if (bestMatch) {
      await this.failures.reset(actor.userId, citizenId);
      await this.audit.recordAccess({
        action: AuditAction.VERIFY_SUCCESS,
        entityType: 'BiometricTemplate',
        entityId: citizenId,
        actorId: actor.userId,
        actorType: actor.role,
        ipAddress: ip,
        metadata: { kind, reason: dto.reason, candidates: stored.length },
      });
      return { match: true };
    }

    // Chemin de NON-MATCH UNIFORME : non-match, citoyen non enrôlé, OU consentement
    // absent/révoqué — TROIS causes, UNE SEULE observabilité (anti-oracle). Le motif
    // interne (`result`) reste dans la trace pour l'investigation, JAMAIS dans la
    // réponse HTTP.
    const internalReason = !consentOk
      ? 'consent_inactive'
      : stored.length === 0
        ? 'not_enrolled'
        : 'no_template_below_threshold';
    return this.failVerify(kind, dto, actor, ip, internalReason);
  }

  /**
   * Chemin d'ÉCHEC UNIFORME du verify 1:1 : compte l'échec (anti-bruteforce,
   * couvre AUSSI le probing de citoyens NON enrôlés / sans consentement), trace
   * (VERIFY_FAIL ou VERIFY_LOCKED + alerte SIEM si le verrou vient d'être atteint),
   * puis renvoie `{ match: false }` — indistinguable d'un non-match côté appelant.
   *
   * @param kind           Type biométrique.
   * @param dto            Corps validé (motif tracé).
   * @param actor          Agent authentifié.
   * @param ip             IP source (audit).
   * @param internalReason Cause INTERNE (trace seulement, jamais exposée).
   */
  private async failVerify(
    kind: BiometricKind,
    dto: VerifyFingerprintDto,
    actor: BioAuthSubject,
    ip: string | null | undefined,
    internalReason: string,
  ): Promise<VerifyResult> {
    const { citizenId } = dto;
    const locked = await this.failures.recordFailure(actor.userId, citizenId);
    await this.audit.recordAccess({
      action: locked ? AuditAction.VERIFY_LOCKED : AuditAction.VERIFY_FAIL,
      entityType: 'BiometricTemplate',
      entityId: citizenId,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: {
        kind,
        reason: dto.reason,
        result: internalReason,
        ...(locked ? { siemAlert: 'BIOMETRIC_VERIFY_BRUTEFORCE_LOCKOUT' } : {}),
      },
    });
    if (locked) {
      this.logger.warn(
        `Verrouillage anti-bruteforce (agent=${actor.userId}, citizen=${citizenId}).`,
      );
    }
    return { match: false };
  }
}
