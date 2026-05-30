/**
 * @file        audit.module.ts
 * @description Module métier de l'audit : assemble crypto (hash + signature),
 *              persistance, normalisation, batching, consumer AMQP, cron de
 *              scellement et controller REST.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuditLogRepository } from './audit-log.repository.js';
import { HashService } from './hash.service.js';
import { SigningService } from './signing.service.js';
import { AuditNormalizer } from './audit.normalizer.js';
import { AuditBatcher } from './audit.batcher.js';
import { AuditConsumer } from './audit.consumer.js';
import { AuditCron } from './audit.cron.js';

@Module({
  controllers: [AuditController],
  providers: [
    HashService,
    SigningService,
    AuditLogRepository,
    AuditNormalizer,
    AuditService,
    AuditBatcher,
    AuditConsumer,
    AuditCron,
  ],
  exports: [AuditService],
})
export class AuditModule {}
