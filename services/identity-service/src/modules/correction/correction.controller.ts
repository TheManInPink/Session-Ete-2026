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

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  ListCorrectionsDto,
  RejectCorrectionDto,
  SubmitCorrectionDto,
} from './dto/correction.dto';
import { CorrectionService } from './correction.service';

@ApiTags('corrections')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
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
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.correctionService.submit(dto, user.id);
  }

  // ─── GET /corrections ────────────────────────────────────────
  @Get()
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Liste paginée des corrections filtrées' })
  async list(@Query() dto: ListCorrectionsDto): Promise<unknown> {
    return this.correctionService.list(dto);
  }

  // ─── GET /corrections/:id ────────────────────────────────────
  @Get(':id')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Détail d\'une correction (avec citoyen joint)' })
  async findById(@Param('id') id: string): Promise<unknown> {
    return this.correctionService.findById(id);
  }

  // ─── PUT /corrections/:id/approve ────────────────────────────
  @Put(':id/approve')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approuve la correction et applique la modification au citoyen' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.correctionService.approve(id, user.id);
  }

  // ─── PUT /corrections/:id/reject ─────────────────────────────
  @Put(':id/reject')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Rejette la correction avec motif obligatoire' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.correctionService.reject(id, dto, user.id);
  }
}
