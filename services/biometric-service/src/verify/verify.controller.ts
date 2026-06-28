/**
 * @file        verify.controller.ts
 * @description API REST de la VÉRIFICATION 1:1 et de l'IDENTIFICATION 1:N.
 *                - 1:1 (`/verify/*`)   : rôle `biometric_operator` + motif tracé
 *                  + anti-bruteforce. Comparaison par distance ≤ τ (boucle sans
 *                  court-circuit).
 *                - 1:N (`/identify/*`) : rôle `inspector` (P3c) + mandat tracé
 *                  (4-yeux), audit OBLIGATOIRE par requête. Limite de
 *                  confidentialité documentée (doc 25 §0.6).
 *              JAMAIS d'accès public ; chaque opération est audité.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/verify
 */
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Roles } from '@nina-aes/auth-guards';
import type { Request } from 'express';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { BioAuthSubject } from '../auth/auth.types.js';
import { BiometricRole } from '../common/biometric.roles.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  identifyFingerprintSchema,
  verifyFingerprintSchema,
  type IdentifyFingerprintDto,
  type VerifyFingerprintDto,
} from './dto/verify.schema.js';
import { VerifyService } from './verify.service.js';
import { IdentifyService } from './identify.service.js';

@ApiTags('verify')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Controller('biometric')
export class VerifyController {
  constructor(
    private readonly verify: VerifyService,
    private readonly identify: IdentifyService,
  ) {}

  /**
   * POST /api/v1/biometric/verify/fingerprint — vérification 1:1 (distance ≤ τ,
   * boucle sans court-circuit). Motif tracé + anti-bruteforce.
   */
  @Post('verify/fingerprint')
  @Roles(BiometricRole.BIOMETRIC_OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifie 1:1 une empreinte (distance ≤ τ, anti-bruteforce, audité).' })
  verifyFingerprint(
    @Body(new ZodValidationPipe(verifyFingerprintSchema)) dto: VerifyFingerprintDto,
    @CurrentUser() actor: BioAuthSubject,
    @Req() req: Request,
  ) {
    return this.verify.verifyFingerprint(dto, actor, req.ip);
  }

  /**
   * POST /api/v1/biometric/identify/fingerprint — recherche 1:N RESTREINTE (P3c).
   * Rôle `inspector` + mandat tracé (4-yeux). Audit obligatoire par requête.
   */
  @Post('identify/fingerprint')
  @Roles(BiometricRole.INSPECTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recherche 1:N restreinte (INSPECTOR + mandat 4-yeux, audité, limite §0.6).',
  })
  identifyFingerprint(
    @Body(new ZodValidationPipe(identifyFingerprintSchema)) dto: IdentifyFingerprintDto,
    @CurrentUser() actor: BioAuthSubject,
    @Req() req: Request,
  ) {
    return this.identify.identifyFingerprint(dto, actor, req.ip);
  }
}
