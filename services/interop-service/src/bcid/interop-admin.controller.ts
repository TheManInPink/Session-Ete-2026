/**
 * @file        interop-admin.controller.ts
 * @description Routes d'ADMINISTRATION / SORTANTES BCID-AES, protégées par le JWT
 *              interne (opérateur Mali) + rôle. Distinctes du verbe entrant
 *              `verify` (mTLS + JWS partenaire) :
 *
 *                POST /api/v1/interop/outgoing/verify — interroge un partenaire
 *                GET  /api/v1/interop/stats           — volumétrie par pays (24h)
 *
 *              Le throttler HTTP générique protège ces endpoints.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Roles, UserRole } from '@nina-aes/auth-guards';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { InteropClientService } from './interop-client.service.js';
import { PartnerRepository } from './partner.repository.js';
import { OutgoingVerifyDto } from './dto/outgoing-verify.dto.js';

@ApiTags('interop-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Controller('interop')
export class InteropAdminController {
  constructor(
    private readonly client: InteropClientService,
    private readonly partners: PartnerRepository,
  ) {}

  /** Déclenche un appel SORTANT verify-nina vers un partenaire (BFA/NER). */
  @Post('outgoing/verify')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Interroge un partenaire (signe la requête, vérifie la réponse JWS).' })
  @ApiOkResponse({ description: 'Réponse minimaliste vérifiée du partenaire.' })
  async outgoingVerify(@Body() dto: OutgoingVerifyDto) {
    return this.client.verifyNinaWith({
      targetCountry: dto.targetCountry,
      nina: dto.nina,
      purpose: dto.purpose,
    });
  }

  /** Volumétrie verify-nina par pays sur les 24 dernières heures (dashboard). */
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Volumétrie BCID-AES par pays (24h) pour le dashboard governance.' })
  async stats() {
    const byCountry = await this.partners.statsByCountry(24);
    return { windowHours: 24, byCountry };
  }
}
