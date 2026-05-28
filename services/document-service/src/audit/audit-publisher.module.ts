/**
 * @file        audit-publisher.module.ts
 * @description Wire AuditPublisherService — exposé global pour permettre
 *              à n'importe quel module métier d'émettre des événements audit.
 * @module      document-service/audit
 */
import { Global, Module } from '@nestjs/common';
import { AuditPublisherService } from './audit-publisher.service';

@Global()
@Module({
  providers: [AuditPublisherService],
  exports: [AuditPublisherService],
})
export class AuditPublisherModule {}
