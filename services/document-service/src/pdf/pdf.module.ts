/**
 * @file        pdf.module.ts
 * @description Wire des services PDF : generator (Puppeteer pool) +
 *              postprocess (pdf-lib métadonnées + attachment JWT).
 * @module      document-service/pdf
 */
import { Module } from '@nestjs/common';
import { PdfGeneratorService } from './pdf-generator.service';
import { PdfPostprocessService } from './pdf-postprocess.service';

@Module({
  providers: [PdfGeneratorService, PdfPostprocessService],
  exports: [PdfGeneratorService, PdfPostprocessService],
})
export class PdfModule {}
