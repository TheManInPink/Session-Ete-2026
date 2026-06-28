/**
 * @file        enrollment.module.ts
 * @description Module ENRÔLEMENT biométrique : consentement ancré requis →
 *              protection cancelable → stockage du template protégé → audit.
 *              Dépend de `ConsentModule` (garde `assertActiveConsent`).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/enrollment
 */
import { Module } from '@nestjs/common';
import { ConsentModule } from '../consent/consent.module.js';
import { EnrollmentController } from './enrollment.controller.js';
import { EnrollmentService } from './enrollment.service.js';

@Module({
  imports: [ConsentModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
})
export class EnrollmentModule {}
