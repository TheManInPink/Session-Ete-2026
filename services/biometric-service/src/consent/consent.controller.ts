/**
 * @file        consent.controller.ts
 * @description API REST du CONSENTEMENT biométrique. Toutes les routes exigent un
 *              JWT agent + rôle `biometric_operator` ; JAMAIS d'accès public. Le
 *              serveur NE FABRIQUE JAMAIS le consentement : il VÉRIFIE un JWS signé
 *              par le citoyen (CONSENT-PROTOCOL §1). Chaque opération est audité.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/consent
 */
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Roles } from '@nina-aes/auth-guards';
import type { Request } from 'express';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { BioAuthSubject } from '../auth/auth.types.js';
import { BiometricRole } from '../common/biometric.roles.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  revokeConsentSchema,
  verifyConsentSchema,
  type RevokeConsentDto,
  type VerifyConsentDto,
} from './dto/consent.schema.js';
import { ConsentService } from './consent.service.js';

@ApiTags('consent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Controller('biometric/consent')
export class ConsentController {
  constructor(private readonly service: ConsentService) {}

  /**
   * POST /api/v1/biometric/consent/verify — vérifie + enregistre une preuve de
   * consentement signée par le citoyen (JWS Ed25519 ancré). 403 uniforme si la
   * chaîne de confiance échoue.
   */
  @Post('verify')
  @Roles(BiometricRole.BIOMETRIC_OPERATOR)
  // RATE-LIMIT SPÉCIFIQUE (anti-abus JWS) — une route de PREUVE SIGNÉE ne doit
  // pas hériter de la limite globale large (60/min) : on la borne plus serré
  // (10/min) pour limiter la devinette/abus de JWS de consentement.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Vérifie + enregistre un consentement signé (JWS Ed25519 ancré).' })
  verify(
    @Body(new ZodValidationPipe(verifyConsentSchema)) dto: VerifyConsentDto,
    @CurrentUser() actor: BioAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.verifyAndPersist(dto, actor, req.ip);
  }

  /**
   * POST /api/v1/biometric/consent/revoke — retrait du consentement (droit de
   * retrait) → déclenche l'effacement des templates (le NINA reste valide).
   */
  @Post('revoke')
  @Roles(BiometricRole.BIOMETRIC_OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Révoque le consentement → efface les templates (droit à l’effacement).',
  })
  revoke(
    @Body(new ZodValidationPipe(revokeConsentSchema)) dto: RevokeConsentDto,
    @CurrentUser() actor: BioAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.revoke(dto, actor, req.ip);
  }
}
