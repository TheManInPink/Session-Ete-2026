/**
 * @file        sgogt.module.ts
 * @description Module SGOGT (Bloc C2) : messagerie officielle signée + escalade
 *              automatique (cron). Le `JwsSigner` (Vault Transit) et
 *              `AuditPublisher` sont fournis par les modules globaux.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/sgogt
 */
import { Module } from '@nestjs/common';
import { SgogtController } from './sgogt.controller.js';
import { SgogtService } from './sgogt.service.js';
import { SgogtRepository } from './sgogt.repository.js';
import { SgogtEscalationService } from './sgogt-escalation.service.js';
import { SgogtEscalationCron } from './sgogt-escalation.cron.js';

@Module({
  controllers: [SgogtController],
  providers: [SgogtService, SgogtRepository, SgogtEscalationService, SgogtEscalationCron],
  exports: [SgogtService, SgogtEscalationService],
})
export class SgogtModule {}
