/**
 * @file        electoral.module.ts
 * @description Module Intégrité électorale (Bloc C3) : pseudonymisation HMAC
 *              Vault, inscription auto 18 ans (cron), export delta DGE signé +
 *              rate-limité + quota atomique + audité.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { Module } from '@nestjs/common';
import { ElectoralController } from './electoral.controller.js';
import { ElectoralRepository } from './electoral.repository.js';
import { ExportService } from './export.service.js';
import { ExportQuotaService } from './export-quota.service.js';
import { PseudonymService } from './pseudonym.service.js';
import { InscriptionService } from './inscription.service.js';
import { InscriptionCron } from './inscription.cron.js';

@Module({
  controllers: [ElectoralController],
  providers: [
    ElectoralRepository,
    ExportService,
    ExportQuotaService,
    PseudonymService,
    InscriptionService,
    InscriptionCron,
  ],
  exports: [PseudonymService, InscriptionService, ExportService],
})
export class ElectoralModule {}
