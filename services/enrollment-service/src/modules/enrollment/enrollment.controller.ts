/**
 * @file        enrollment.controller.ts
 * @description Endpoints HTTP de l'enrôlement.
 *
 *              MVP — endpoints livrés :
 *              - POST /enrollment/initiate : démarre un enrôlement
 *              - GET  /enrollment/:id/status : consulte le statut
 *
 * @module      enrollment-service/enrollment
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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { InitiateEnrollmentDto, InitiateEnrollmentResponseDto } from './dto/initiate.dto.js';
import { EnrollmentService } from './enrollment.service.js';

@ApiTags('enrollment')
@Controller('enrollment')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  /**
   * Démarre un nouvel enrôlement. À appeler par l'agent CTDEC après avoir
   * collecté les informations sur le citoyen au guichet ou en équipe mobile.
   */
  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initier un enrôlement et proposer un NINA candidat' })
  @ApiResponse({
    status: 201,
    description: 'Enrôlement créé',
    type: InitiateEnrollmentResponseDto,
  })
  @ApiResponse({ status: 401, description: 'JWT manquant ou invalide' })
  @ApiResponse({ status: 422, description: 'Données invalides' })
  async initiate(@Body() dto: InitiateEnrollmentDto): Promise<InitiateEnrollmentResponseDto> {
    return this.enrollmentService.initiate(dto);
  }

  /**
   * Consulte le statut d'un enrôlement en cours.
   */
  @Get(':id/status')
  @ApiOperation({ summary: "Consulter le statut d'un enrôlement" })
  @ApiResponse({ status: 200, description: 'Statut courant' })
  @ApiResponse({ status: 404, description: 'Enrôlement introuvable' })
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollmentService.getStatus(id);
  }
}
