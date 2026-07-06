/**
 * @file        governance.module.ts
 * @description Module GOUVERNANCE — héberge le gate DPIA/RGPD bloquant (fail-fast
 *              en production sans DPIA signée). Global pour exposer `DpiaGateService`
 *              (état du gate) si d'autres modules veulent le consulter.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/governance
 */
import { Global, Module } from '@nestjs/common';
import { DpiaGateService } from './dpia-gate.service.js';

@Global()
@Module({
  providers: [DpiaGateService],
  exports: [DpiaGateService],
})
export class GovernanceModule {}
