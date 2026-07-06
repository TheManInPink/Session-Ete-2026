/**
 * @file        fdi.service.ts
 * @description Orchestrateur de la génération d'une Fiche Descriptive
 *              Individuelle. Enchaîne :
 *
 *                1. Fetch citoyen + 2x chaînes Location 8 niveaux (identity)
 *                2. Génération jti UUIDv7 + serial number + watermark
 *                3. Construction payload canonique → fdi.hash (SHA-256)
 *                4. Signature QR JWT RS256 via Vault Transit
 *                5. Rendu HTML Handlebars + i18n + QR data URL
 *                6. PDF Puppeteer A4 + post-process pdf-lib (PDF/A + jwt.attach)
 *                7. Upload MinIO bucket "fiches" avec Object Lock 10 ans
 *                8. Persistence Prisma (append-only)
 *                9. Audit RabbitMQ → document.fdi.generated
 *
 *              Et symétriquement pour `revoke()`.
 *
 *              Latence cible p95 < 1500 ms (cf. docs/10 §13.1).
 *
 * @module      document-service/fdi
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { prisma } from '@nina-aes/database';
import type { Env } from '../config/env.schema';
import { IdentityClient } from '../identity-client/identity.client';
import { TemplateService } from '../templates/template.service';
import { QrSignerService } from '../qr/qr-signer.service';
import { RevocationService } from '../qr/revocation.service';
import { PdfGeneratorService } from '../pdf/pdf-generator.service';
import { PdfPostprocessService } from '../pdf/pdf-postprocess.service';
import { MinioService } from '../storage/minio.service';
import { AuditPublisherService } from '../audit/audit-publisher.service';
import { SerialNumberService } from './serial-number.service';
import { canonicalJson } from './canonical';
import { computeWatermark } from './watermark';
import type { QrPayload } from '../qr/qr-payload.interface';

export interface FdiGenerateInput {
  nina: string;
  language: 'fra' | 'bam' | 'snk' | 'fuv';
  requesterId: string;
  requesterIp: string;
  userAgent: string;
}

export interface FdiGenerateResult {
  documentId: string;
  serialNumber: string;
  jti: string;
  sha256Pdf: string;
  qrJwt: string;
  downloadUrl: string;
  expiresAt: string;
}

export interface FdiRevokeInput {
  documentId: string;
  reason: 'DECEASED' | 'FRAUD_DETECTED' | 'DATA_CORRECTION' | 'CITIZEN_REQUEST' | 'OTHER';
  reasonText?: string;
  revokedBy: string;
}

@Injectable()
export class FdiService {
  private readonly log = new Logger(FdiService.name);
  private readonly ttlDays: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly identity: IdentityClient,
    private readonly template: TemplateService,
    private readonly qr: QrSignerService,
    private readonly revocation: RevocationService,
    private readonly pdf: PdfGeneratorService,
    private readonly post: PdfPostprocessService,
    private readonly storage: MinioService,
    private readonly audit: AuditPublisherService,
    private readonly serial: SerialNumberService,
  ) {
    this.ttlDays = cfg.get('FDI_TTL_DAYS', { infer: true });
  }

  async generate(input: FdiGenerateInput): Promise<FdiGenerateResult> {
    // 1. Citoyen + chaînes de lieux
    const citizen = await this.identity.fetchCitizen(input.nina);
    if (!citizen) {
      // 🔒 Ne jamais échoyer le NINA en clair dans un message d'erreur (il
      // remonte dans les logs centralisés / réponses d'erreur). On expose une
      // référence hachée non réversible qui reste corrélable côté ops.
      const ninaRef = createHash('sha256').update(input.nina).digest('hex').slice(0, 8);
      throw new NotFoundException(`NINA (réf. ${ninaRef}) introuvable`);
    }

    const [birthPlace, residence] = await Promise.all([
      this.identity.fetchLocation(citizen.birthPlace.id),
      this.identity.fetchLocation(citizen.residence.id),
    ]);

    // 2. Identifiants stables
    const jti = uuidv7();
    const documentId = uuidv7();
    const serialNumber = await this.serial.next();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + this.ttlDays * 86_400;
    const issuedAt = new Date(iat * 1000);
    const issuedAtIso = issuedAt.toISOString();
    const watermark = computeWatermark(input.requesterIp, input.userAgent, jti);

    // 3. Payload canonique → fdi.hash
    const fdiHash = createHash('sha256')
      .update(
        canonicalJson({
          serialNumber,
          type: 'FICHE_DESCRIPTIVE' as const,
          language: input.language,
          issuedAt: issuedAtIso,
          documentId,
          citizen: this.summarizeCitizen(citizen),
        }),
      )
      .digest('hex');

    // 4. Signature QR via Vault Transit
    const payload: QrPayload = {
      iss: 'urn:nina-aes:ctdec-bamako',
      sub: citizen.nina,
      jti,
      iat,
      nbf: iat,
      exp,
      aud: ['urn:nina-aes:verifier'],
      fdi: {
        serialNumber,
        type: 'FICHE_DESCRIPTIVE',
        language: input.language,
        hash: fdiHash,
        issuedAt: issuedAtIso,
        documentId,
      },
      citizen: this.summarizeCitizen(citizen),
      biometricHash: citizen.fingerprintHash ?? null,
      wm: watermark,
    };
    const { token: qrJwt, kid } = await this.qr.sign(payload);

    // 5. Rendu HTML
    const { html, sha256Html } = await this.template.render({
      citizen,
      birthPlace,
      residence,
      document: { id: documentId, serialNumber, issuedAt: issuedAtIso, jti, watermark },
      language: input.language,
      qrToken: qrJwt,
    });

    // 6. PDF Puppeteer + post-process pdf-lib
    const rawPdf = await this.pdf.fromHtml(html);
    const finalPdf = await this.post.toPdfA(rawPdf, {
      jwtAttachment: qrJwt,
      issuedAt,
      serialNumber,
    });
    const sha256Pdf = createHash('sha256').update(finalPdf).digest('hex');

    // 7. Upload MinIO (Object Lock COMPLIANCE 10 ans)
    const stored = await this.storage.put({
      nina: citizen.nina,
      jti,
      buffer: finalPdf,
    });

    // 8. Persistence (append-only)
    await prisma.document.create({
      data: {
        id: documentId,
        jti,
        nina: citizen.nina,
        type: 'FICHE_DESCRIPTIVE',
        serialNumber,
        language: input.language,
        sha256Html,
        sha256Pdf,
        kid,
        minioBucket: stored.objectKey.startsWith('fiches/') ? 'fiches' : 'fiches',
        minioObjectKey: stored.objectKey,
        minioVersionId: stored.versionId || null,
        issuedAt,
        expiresAt: new Date(exp * 1000),
        issuedBy: input.requesterId,
        issuedFromIp: input.requesterIp,
        watermark,
      },
    });

    // 9. Audit asynchrone
    await this.audit.publish('document.fdi.generated', {
      documentId,
      jti,
      nina: citizen.nina,
      serialNumber,
      issuedBy: input.requesterId,
      kid,
      sha256Pdf,
    });

    // 🔒 Journal applicatif sans PII : `jti` (UUIDv7) suffit à corréler. Le NINA
    // reste tracé uniquement dans l'événement d'audit immuable ci-dessus.
    this.log.log({ jti, serialNumber }, 'FDI émise');

    return {
      documentId,
      serialNumber,
      jti,
      sha256Pdf,
      qrJwt,
      downloadUrl: stored.presignedUrl,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async revoke(
    input: FdiRevokeInput,
  ): Promise<{ revoked: true; jti: string } | { alreadyRevoked: true }> {
    const doc = await prisma.document.findUnique({
      where: { id: input.documentId },
      include: { revocation: true },
    });
    if (!doc) throw new NotFoundException(`Document ${input.documentId} introuvable`);
    if (doc.revocation) return { alreadyRevoked: true };

    await prisma.documentRevocation.create({
      data: {
        documentId: doc.id,
        reason: input.reason,
        reasonText: input.reasonText ?? null,
        revokedBy: input.revokedBy,
      },
    });

    // Ajoute le jti à la liste de révocation Redis (TTL aligné sur exp)
    await this.revocation.add(doc.jti, doc.expiresAt);

    await this.audit.publish('document.revoked', {
      documentId: doc.id,
      jti: doc.jti,
      reason: input.reason,
      revokedBy: input.revokedBy,
    });

    this.log.log({ jti: doc.jti, reason: input.reason }, 'FDI révoquée');
    return { revoked: true, jti: doc.jti };
  }

  /** Réduit un citoyen complet en summary minimisé pour le payload QR. */
  private summarizeCitizen(
    c: Awaited<ReturnType<IdentityClient['fetchCitizen']>>,
  ): QrPayload['citizen'] {
    return {
      nina: c.nina,
      firstName: c.firstName,
      lastName: c.lastName,
      birthDate: c.birthDate,
      sex: c.sex === 'MALE' ? 'M' : c.sex === 'FEMALE' ? 'F' : 'U',
      birthPlace: c.birthPlace.name,
    };
  }
}
