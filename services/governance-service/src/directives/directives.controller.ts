/**
 * @file        directives.controller.ts
 * @description API REST des directives Kanban (Bloc C2). JWT + rôle institutionnel
 *              requis. Transitions auditées ; le créateur est toujours
 *              l'utilisateur authentifié.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/directives
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@nina-aes/auth-guards';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GovAuthSubject } from '../auth/auth.types.js';
import { SGOGT_ROLES } from '../common/governance.roles.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  createDirectiveSchema,
  transitionDirectiveSchema,
  type CreateDirectiveDto,
  type TransitionDirectiveDto,
} from './dto/directive.schema.js';
import { DirectivesService } from './directives.service.js';

@ApiTags('directives')
@ApiBearerAuth()
@Controller('directives')
export class DirectivesController {
  constructor(private readonly service: DirectivesService) {}

  /** POST /api/v1/directives — crée une directive (DRAFT). */
  @Post()
  @Roles(...SGOGT_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crée une directive Kanban (statut initial DRAFT).' })
  create(
    @Body(new ZodValidationPipe(createDirectiveSchema)) dto: CreateDirectiveDto,
    @CurrentUser() actor: GovAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.create(dto, actor, req.ip);
  }

  /** GET /api/v1/directives — liste par statut (colonne Kanban). */
  @Get()
  @Roles(...SGOGT_ROLES, 'auditor')
  @ApiOperation({ summary: 'Liste paginée des directives par statut.' })
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list(status, page ? Number(page) : 1, pageSize ? Number(pageSize) : 50);
  }

  /** POST /api/v1/directives/:id/transition — change de colonne (audité). */
  @Post(':id/transition')
  @Roles(...SGOGT_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition de cycle de vie (validée par la machine à états).' })
  transition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(transitionDirectiveSchema)) dto: TransitionDirectiveDto,
    @CurrentUser() actor: GovAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.transition(id, dto, actor, req.ip);
  }
}
