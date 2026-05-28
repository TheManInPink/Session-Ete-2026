/**
 * @file        template.module.ts
 * @description Wire {@link TemplateService} (Handlebars + i18n + QR).
 * @module      document-service/templates
 */
import { Module } from '@nestjs/common';
import { TemplateService } from './template.service';

@Module({
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
