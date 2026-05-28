/**
 * @file        fdi.module.ts
 * @description Wire de l'orchestrateur FdiService + utilitaires
 *              (SerialNumberService, helpers canonical/watermark).
 *              Dépend des modules déjà @Global() : Identity, Qr, Pdf,
 *              Storage, Audit, Template, Vault, Redis.
 *
 * @module      document-service/fdi
 */
import { Module } from '@nestjs/common';
import { TemplateModule } from '../templates/template.module';
import { QrModule } from '../qr/qr.module';
import { PdfModule } from '../pdf/pdf.module';
import { FdiService } from './fdi.service';
import { SerialNumberService } from './serial-number.service';

@Module({
  imports: [TemplateModule, QrModule, PdfModule],
  providers: [FdiService, SerialNumberService],
  exports: [FdiService],
})
export class FdiModule {}
