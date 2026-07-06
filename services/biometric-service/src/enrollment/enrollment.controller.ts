/**
 * @file        enrollment.controller.ts
 * @description API REST de l'ENRÔLEMENT biométrique. Toutes les routes exigent un
 *              JWT agent + rôle `biometric_operator` ; JAMAIS d'accès public.
 *              L'anti-IDOR est porté par la garde de consentement ancré dans le
 *              service (le citizenId est lié au consentement signé). Chaque
 *              enrôlement est audité.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/enrollment
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
  enrollFaceSchema,
  enrollFingerprintSchema,
  type EnrollFaceDto,
  type EnrollFingerprintDto,
} from './dto/enroll.schema.js';
import { EnrollmentService } from './enrollment.service.js';

@ApiTags('enrollment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Controller('biometric/enrollment')
export class EnrollmentController {
  constructor(private readonly service: EnrollmentService) {}

  /**
   * POST /api/v1/biometric/enrollment/fingerprint — enrôle une empreinte (P3a).
   * Exige un consentement actif ancré (`enroll:FINGERPRINT`). Stocke un template
   * PROTÉGÉ uniquement.
   */
  @Post('fingerprint')
  @Roles(BiometricRole.BIOMETRIC_OPERATOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enrôle une empreinte (template protégé cancelable, jamais d’image).' })
  fingerprint(
    @Body(new ZodValidationPipe(enrollFingerprintSchema)) dto: EnrollFingerprintDto,
    @CurrentUser() actor: BioAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.enrollFingerprint(dto, actor, req.ip);
  }

  /**
   * POST /api/v1/biometric/enrollment/face — enrôle un visage (P3b). Exige un
   * consentement actif ancré (`enroll:FACE`).
   */
  @Post('face')
  @Roles(BiometricRole.BIOMETRIC_OPERATOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enrôle un visage (embedding protégé cancelable, jamais d’image).' })
  face(
    @Body(new ZodValidationPipe(enrollFaceSchema)) dto: EnrollFaceDto,
    @CurrentUser() actor: BioAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.enrollFace(dto, actor, req.ip);
  }
}
