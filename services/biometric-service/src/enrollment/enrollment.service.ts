/**
 * @file        enrollment.service.ts
 * @description Cœur métier de l'ENRÔLEMENT biométrique. Flux (doc 25 §4.2) :
 *                1) GARDE CONSENTEMENT — exige un consentement actif ANCRÉ
 *                   couvrant le scope (`enroll:FINGERPRINT`/`enroll:FACE`) pour CE
 *                   citoyen. L'ancrage du consentement (sub == citizenId) FERME la
 *                   surface IDOR sur l'enrôlement (un agent ne peut pas enrôler un
 *                   citizenId arbitraire sans consentement valide POUR lui).
 *                2) Citoyen existant.
 *                3) NORMALISATION du vecteur de features (jamais l'image).
 *                4) PROTECTION cancelable (kid actif) → template PROTÉGÉ. Le
 *                   vecteur clair est effacé best-effort (`withWipe`).
 *                5) STOCKAGE du template protégé + métadonnées (métrique, seuil τ,
 *                   ancre de consentement). JAMAIS d'image, JAMAIS de template clair.
 *                6) AUDIT DURABLE (fail-closed) — pas d'opération sans trace.
 *
 *              CANON : on ne stocke ni image, ni template en clair ; la comparaison
 *              se fera par DISTANCE + seuil τ (jamais par égalité de hash).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/enrollment
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BiometricKind } from '@nina-aes/database';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import type { BioAuthSubject } from '../auth/auth.types.js';
import { CancelableService } from '../cancelable/cancelable.service.js';
import { normalizeFeatureVector } from '../cancelable/feature-extractor.js';
import { withWipe } from '../cancelable/secure-buffer.js';
import { ConsentService } from '../consent/consent.service.js';
import { TemplatesRepository } from '../templates/templates.repository.js';
import type { Env } from '../config/env.schema.js';
import type { EnrollFaceDto, EnrollFingerprintDto } from './dto/enroll.schema.js';

/** Schéma de protection employé (traçabilité + migration). */
const PROTECTION_SCHEME = 'cancelable-randproj/v1 (ISO 24745)';

/** Résultat d'un enrôlement (jamais le template, jamais le vecteur). */
export interface EnrollResult {
  id: string;
  citizenId: string;
  kind: string;
  transformKid: string;
  protectionScheme: string;
}

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);
  private readonly activeKid: string;
  private readonly threshold: number;
  private readonly metric: string;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly cancelable: CancelableService,
    private readonly consent: ConsentService,
    private readonly templates: TemplatesRepository,
    private readonly audit: AuditPublisher,
  ) {
    this.activeKid = cfg.get('BIOMETRIC_ACTIVE_TRANSFORM_KID', { infer: true });
    this.threshold = cfg.get('BIOMETRIC_MATCH_THRESHOLD', { infer: true });
    this.metric = cfg.get('BIOMETRIC_MATCH_METRIC', { infer: true });
  }

  /** Enrôle une empreinte (P3a). */
  enrollFingerprint(
    dto: EnrollFingerprintDto,
    actor: BioAuthSubject,
    ip?: string | null,
  ): Promise<EnrollResult> {
    return this.enroll(
      BiometricKind.FINGERPRINT,
      'enroll:FINGERPRINT',
      dto.citizenId,
      dto.featureVector,
      dto.templateFormat,
      actor,
      ip,
    );
  }

  /** Enrôle un visage (P3b). */
  enrollFace(dto: EnrollFaceDto, actor: BioAuthSubject, ip?: string | null): Promise<EnrollResult> {
    return this.enroll(
      BiometricKind.FACE,
      'enroll:FACE',
      dto.citizenId,
      dto.featureVector,
      dto.templateFormat,
      actor,
      ip,
    );
  }

  /** Pipeline d'enrôlement commun (empreinte/visage). */
  private async enroll(
    kind: BiometricKind,
    scope: string,
    citizenId: string,
    rawVector: readonly number[],
    templateFormat: string,
    actor: BioAuthSubject,
    ip?: string | null,
  ): Promise<EnrollResult> {
    // 1) GARDE CONSENTEMENT ANCRÉ (anti-IDOR : pas d'enrôlement sans consentement
    //    valide POUR ce citizenId). Lève 403 si absent/expiré/scope différent.
    const consent = await this.consent.assertActiveConsent(citizenId, scope);

    // 2) Citoyen existant.
    const citizen = await this.templates.findCitizen(citizenId);
    if (!citizen) throw new NotFoundException('Citoyen introuvable');

    // 3-4) Normaliser → protéger (cancelable) ; le vecteur clair est éphémère et
    //      effacé best-effort dès la projection terminée (withWipe).
    const features = normalizeFeatureVector(rawVector);
    const protectedTemplate = await withWipe(features, (f) =>
      this.cancelable.protect(f, this.activeKid),
    );

    // 5) Stocker UNIQUEMENT le template protégé + métadonnées de comparaison.
    const rec = await this.templates.create({
      citizenId,
      kind,
      protectedTemplate,
      transformKid: this.activeKid,
      protectionScheme: PROTECTION_SCHEME,
      templateFormat,
      matchMetric: this.metric,
      matchThreshold: this.threshold,
      capturedBy: actor.userId,
      consentSignerKid: consent.signerKid,
      consentJti: consent.jti,
    });
    // On n'a plus besoin du template protégé en mémoire applicative ici.
    protectedTemplate.fill(0);

    const id = rec.id.toString();

    // 6) AUDIT DURABLE (fail-closed) — pas d'opération biométrique sans trace.
    await this.audit.recordAccess({
      action: AuditAction.REGISTERED,
      entityType: 'BiometricTemplate',
      entityId: id,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { kind, transformKid: this.activeKid, citizenId, consentJti: consent.jti },
    });

    this.logger.log(`Template ${kind} enrôlé (id=${id}, kid=${this.activeKid}).`);
    return {
      id,
      citizenId,
      kind,
      transformKid: this.activeKid,
      protectionScheme: PROTECTION_SCHEME,
    };
  }
}
