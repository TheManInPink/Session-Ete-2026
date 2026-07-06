/**
 * @file        templates.module.ts
 * @description Module global exposant `TemplatesRepository` (accès aux templates
 *              protégés) — partagé par enrollment, verify, identify et consent
 *              (effacement). Global pour éviter les réimports croisés.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/templates
 */
import { Global, Module } from '@nestjs/common';
import { TemplatesRepository } from './templates.repository.js';

@Global()
@Module({
  providers: [TemplatesRepository],
  exports: [TemplatesRepository],
})
export class TemplatesModule {}
