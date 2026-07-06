/**
 * @file        identify.service.ts
 * @description Cœur métier de l'IDENTIFICATION 1:N RESTREINTE (P3c, doc 25 §2 /
 *              ADR-025). Recherche d'un citoyen dans la base sur une sonde
 *              biométrique (cas d'investigation OCLEI sur fraude). Accès `inspector`
 *              + mandat tracé (4-yeux). Audit OBLIGATOIRE de CHAQUE requête.
 *
 *              ⚠️  LIMITE DE CONFIDENTIALITÉ ASSUMÉE (doc 25 §0.6, DPIA R2). Un
 *              index ANN exploite la distance pour être rapide ; le template
 *              protégé indexé CONSERVE donc de la structure géométrique. Il reste
 *              RÉVOCABLE et NON INVERSIBLE vers l'image, MAIS n'équivaut PAS à un
 *              chiffrement fort : un attaquant détenant l'index ET le paramètre
 *              cancelable peut faire du _linkage_. Mitigations : paramètre dans
 *              Vault SÉPARÉ de l'index, accès 4-yeux, audit par requête, rotation
 *              sur incident.
 *
 *              ⚠️  IMPLÉMENTATION ACTUELLE — balayage LINÉAIRE des templates
 *              protégés (correct mais O(N)). En production, REMPLACER par un index
 *              ANN (FAISS) sur les templates protégés (jamais sur des hash — un
 *              hash détruirait la métrique, §0.3), pour tenir la cible p95 < 2 s
 *              sur 11M citoyens (doc 25 §2). Le paramètre reste hors de l'index.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/verify
 */
import { Injectable, Logger } from '@nestjs/common';
import { BiometricKind } from '@nina-aes/database';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import type { BioAuthSubject } from '../auth/auth.types.js';
import { CancelableService } from '../cancelable/cancelable.service.js';
import { normalizeFeatureVector } from '../cancelable/feature-extractor.js';
import { withWipe } from '../cancelable/secure-buffer.js';
import { TemplatesRepository } from '../templates/templates.repository.js';
import type { IdentifyFingerprintDto } from './dto/verify.schema.js';

/** Un candidat 1:N (citoyen + distance protégée). */
export interface IdentifyCandidate {
  citizenId: string;
  distance: number;
}

/** Résultat d'une recherche 1:N (top-K candidats sous le seuil). */
export interface IdentifyResult {
  candidates: IdentifyCandidate[];
  scanned: number;
}

@Injectable()
export class IdentifyService {
  private readonly logger = new Logger(IdentifyService.name);

  constructor(
    private readonly cancelable: CancelableService,
    private readonly templates: TemplatesRepository,
    private readonly audit: AuditPublisher,
  ) {}

  /** Recherche 1:N restreinte sur empreinte (P3c). */
  async identifyFingerprint(
    dto: IdentifyFingerprintDto,
    actor: BioAuthSubject,
    ip?: string | null,
  ): Promise<IdentifyResult> {
    const kind = BiometricKind.FINGERPRINT;

    // Balayage des templates protégés actifs (⏳ remplacer par index ANN).
    const all = await this.templates.findAllActive(kind);
    const features = normalizeFeatureVector(dto.featureVector);

    const scored = await withWipe(features, async (f) => {
      // Cache de sondes projetées par kid (éviter de re-projeter pour chaque
      // template du même kid). Effacé après usage.
      const probeByKid = new Map<string, Uint8Array>();
      const out: IdentifyCandidate[] = [];
      for (const tpl of all) {
        let probe = probeByKid.get(tpl.transformKid);
        if (!probe) {
          probe = await this.cancelable.protect(f, tpl.transformKid);
          probeByKid.set(tpl.transformKid, probe);
        }
        const distance = this.cancelable.distance(probe, new Uint8Array(tpl.protectedTemplate));
        if (this.cancelable.isMatch(distance, tpl.matchThreshold)) {
          out.push({ citizenId: tpl.citizenId, distance });
        }
      }
      for (const p of probeByKid.values()) p.fill(0);
      return out;
    });

    // Top-K par distance croissante (les plus proches d'abord).
    scored.sort((a, b) => a.distance - b.distance);
    const candidates = scored.slice(0, dto.topK);

    // AUDIT DURABLE OBLIGATOIRE de CHAQUE requête 1:N (mandat tracé, 4-yeux).
    await this.audit.recordAccess({
      action: AuditAction.IDENTIFY_QUERIED,
      entityType: 'BiometricTemplate',
      entityId: `identify:${kind}`,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: {
        kind,
        mandateRef: dto.mandateRef,
        scanned: all.length,
        matches: candidates.length,
        topK: dto.topK,
      },
    });

    this.logger.log(
      `1:N ${kind} (inspector=${actor.userId}, mandat=${dto.mandateRef}) : ` +
        `${candidates.length}/${all.length} candidats.`,
    );
    return { candidates, scanned: all.length };
  }
}
