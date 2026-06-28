/**
 * @file        verify.module.ts
 * @description Module VÉRIFICATION 1:1 + IDENTIFICATION 1:N restreinte. Distance +
 *              seuil τ (boucle sans court-circuit), anti-bruteforce, audit par
 *              opération. Dépend des modules globaux (cancelable, templates, audit).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/verify
 */
import { Module } from '@nestjs/common';
import { ConsentModule } from '../consent/consent.module.js';
import { VerifyController } from './verify.controller.js';
import { VerifyService } from './verify.service.js';
import { IdentifyService } from './identify.service.js';
import { FailureTrackerService } from './failure-tracker.service.js';
import { RedisFailureStore } from './failure-store.redis.js';

@Module({
  imports: [ConsentModule],
  controllers: [VerifyController],
  providers: [VerifyService, IdentifyService, FailureTrackerService, RedisFailureStore],
})
export class VerifyModule {}
