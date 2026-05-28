/**
 * @file        documents.module.ts
 * @description Wire des controllers REST (privé + public).
 * @module      document-service/documents
 */
import { Module } from '@nestjs/common';
import { FdiModule } from '../fdi/fdi.module';
import { QrModule } from '../qr/qr.module';
import { DocumentsController } from './documents.controller';
import { PublicDocumentsController } from './public-documents.controller';

@Module({
  imports: [FdiModule, QrModule],
  controllers: [DocumentsController, PublicDocumentsController],
})
export class DocumentsModule {}
