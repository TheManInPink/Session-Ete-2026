/**
 * @file        pdf-postprocess.service.ts
 * @description Post-traite le PDF Puppeteer brut :
 *                - Ajoute métadonnées (producer, title, subject, keywords)
 *                - Attache le JWT QR brut comme PDF Attachment `qr.jwt`
 *                  (permet la vérification hors-ligne sans scanner le QR
 *                  optique, utile pour un agent qui reçoit le PDF par email)
 *                - Définit les dates de création/modification déterministes
 *                  pour faciliter la régression visuelle
 *
 * @module      document-service/pdf
 */
import { Injectable } from '@nestjs/common';
import { AFRelationship, PDFDocument } from 'pdf-lib';

export interface PostprocessOptions {
  /** JWT QR brut à attacher dans le PDF (~1.3 KB). */
  jwtAttachment: string;
  /** Date à utiliser pour creation+modification (déterminisme tests). */
  issuedAt: Date;
  /** Numéro de souche FDI (affiché dans le subject). */
  serialNumber: string;
}

@Injectable()
export class PdfPostprocessService {
  /**
   * Convertit le PDF brut Puppeteer en PDF/A-3b avec métadonnées + attachment.
   */
  async toPdfA(raw: Buffer, opts: PostprocessOptions): Promise<Buffer> {
    const pdf = await PDFDocument.load(raw);

    pdf.setProducer('NINA-AES document-service');
    pdf.setCreator('CTDEC — Bamako');
    pdf.setTitle('Fiche Descriptive Individuelle');
    pdf.setSubject(`FDI ${opts.serialNumber}`);
    pdf.setKeywords(['NINA', 'AES', 'CTDEC', 'FDI', 'Mali']);
    pdf.setCreationDate(opts.issuedAt);
    pdf.setModificationDate(opts.issuedAt);

    // Attache le JWT QR brut : utile pour un vérificateur qui reçoit le PDF
    // sans avoir à scanner le QR optique (ex. email d'un agent).
    await pdf.attach(Buffer.from(opts.jwtAttachment, 'utf8'), 'qr.jwt', {
      mimeType: 'application/jwt',
      description: 'JWT QR code (RS256, payload identique au QR imprimé)',
      creationDate: opts.issuedAt,
      modificationDate: opts.issuedAt,
      afRelationship: AFRelationship.Source,
    });

    const out = await pdf.save({ useObjectStreams: false });
    return Buffer.from(out);
  }
}
