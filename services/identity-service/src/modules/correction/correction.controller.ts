/**
 * @file        correction.controller.ts
 * @description Controller REST des corrections NINA.
 *
 *              Routes :
 *                POST /api/v1/corrections           soumission citoyen
 *                GET  /api/v1/corrections           liste paginée (agent+)
 *                GET  /api/v1/corrections/:id       détail
 *                PUT  /api/v1/corrections/:id/approve  (agent+)
 *                PUT  /api/v1/corrections/:id/reject   (agent+, motif obligatoire)
 *
 * @module      identity-service/correction
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@nina-aes/shared-types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard, RolesGuard, type RequestUser } from '../../auth/guards';
import { ListCorrectionsDto, RejectCorrectionDto, SubmitCorrectionDto } from './dto/correction.dto';
import { CorrectionService } from './correction.service';

// Authentifié (JwtAuthGuard, fail-closed) puis autorisé par rôle (RolesGuard).
// Toutes les routes portent déjà un @Roles() explicite (cf. ci-dessous).
@ApiTags('corrections')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('corrections')
export class CorrectionController {
  constructor(private readonly correctionService: CorrectionService) {}

  // ─── POST /corrections ───────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.CITIZEN, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Soumet une demande de correction NINA' })
  @ApiResponse({ status: 201, description: 'Correction soumise + analyse IA déclenchée' })
  async submit(
    @Body() dto: SubmitCorrectionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    // 🔒 Anti-IDOR (write-side) : on transmet l'utilisateur COMPLET (rôle + nina)
    // pour que le service lie une soumission citoyen à son propre dossier.
    return this.correctionService.submit(dto, user);
  }

  // ─── GET /corrections ────────────────────────────────────────
  @Get()
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Liste paginée des corrections filtrées' })
  async list(@Query() dto: ListCorrectionsDto): Promise<unknown> {
    return this.correctionService.list(dto);
  }

  // ─── GET /corrections/me (citoyen : SES corrections uniquement) ──
  // ⚠️ ORDRE : DOIT précéder `@Get(':id')`, sinon "me" serait capturé comme un
  // paramètre :id et routé vers findById (réservé agent) → jamais atteint.
  // 🔒 Anti-IDOR (read-side) : AUCUN paramètre d'entrée — le NINA est dérivé du
  // token (claim `nina`), un citoyen ne peut donc PAS lister le dossier d'autrui.
  @Get('me')
  @Roles(UserRole.CITIZEN)
  @ApiOperation({ summary: 'Liste les corrections du citoyen authentifié (NINA du token)' })
  @ApiResponse({ status: 200, description: 'Corrections du dossier du citoyen connecté' })
  @ApiResponse({ status: 403, description: 'Token sans NINA (compte non citoyen)' })
  async listMine(@CurrentUser() user: RequestUser): Promise<unknown> {
    // Fail-closed : un token CITIZEN sans claim `nina` ne peut rien scoper.
    if (!user.nina) {
      throw new ForbiddenException('CORRECTION_ME_REQUIRES_NINA');
    }
    return this.correctionService.listForCitizen(user.nina);
  }

  // ─── GET /corrections/:id ────────────────────────────────────
  @Get(':id')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: "Détail d'une correction (avec citoyen joint)" })
  async findById(@Param('id') id: string): Promise<unknown> {
    return this.correctionService.findById(id);
  }

  // ─── PUT /corrections/:id/approve ────────────────────────────
  @Put(':id/approve')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approuve la correction et applique la modification au citoyen' })
  async approve(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<unknown> {
    return this.correctionService.approve(id, user.id);
  }

  // ─── PUT /corrections/:id/reject ─────────────────────────────
  @Put(':id/reject')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Rejette la correction avec motif obligatoire' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectCorrectionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<unknown> {
    return this.correctionService.reject(id, dto, user.id);
  }
}
