/**
 * @file        cancelable.module.ts
 * @description Module global de PROTECTION DE TEMPLATE (cancelable, ISO/IEC
 *              24745). Expose `CancelableService` (protection + distance) aux
 *              modules métier (enrollment, verify, identify). Global pour éviter
 *              les réimports ; le paramètre Vault est résolu paresseusement.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/cancelable
 */
import { Global, Module } from '@nestjs/common';
import { CancelableService } from './cancelable.service.js';

@Global()
@Module({
  providers: [CancelableService],
  exports: [CancelableService],
})
export class CancelableModule {}
