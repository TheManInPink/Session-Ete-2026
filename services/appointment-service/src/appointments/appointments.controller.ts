/**
 * @file        appointments.controller.ts
 * @description API REST des rendez-vous. Toutes les routes exigent un JWT + un
 *              rôle. Opérations **médiées par le personnel / le portail** :
 *              réservées aux rôles AGENT / SUPERVISOR / ADMIN (+ AUDITOR en
 *              lecture). Le `citizenId` est fourni par l'appelant de confiance
 *              (agent au guichet, ou BFF du portail citoyen / USSD / borne qui a
 *              authentifié le citoyen et résolu son identité).
 *
 *              ⚠️  Le rôle CITIZEN n'est volontairement PAS accordé ici : tant
 *              qu'il n'existe pas de liaison forte `JWT.sub ↔ Citizen.id`
 *              (ressort d'identity/auth-service), autoriser un citoyen à passer
 *              un `citizenId` arbitraire ouvrirait une faille d'autorisation
 *              horizontale (IDOR/BOLA : lecture/annulation des RDV d'autrui,
 *              passe-droit prioritaire). Voir README §7 + ADR-028.
 *
 *              Ordre des routes : `queue/:centerId` (littéral) AVANT `:id` pour
 *              éviter la capture par le paramètre.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Roles, UserRole, type AuthSubject } from '@nina-aes/auth-guards';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AppointmentsService } from './appointments.service.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { CreateSelfAppointmentDto } from './dto/create-self-appointment.dto.js';
import { ListAppointmentsQuery } from './dto/list-appointments.query.js';

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  /** POST /api/v1/appointments — crée un rendez-vous (agent / portail de confiance). */
  @Post()
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crée un rendez-vous (file prioritaire si vulnérabilité validée).' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.service.create({
      citizenId: dto.citizenId,
      centerId: dto.centerId,
      slot: dto.slot,
      reason: dto.reason,
      vulnerabilityCategory: dto.vulnerabilityCategory,
    });
  }

  /**
   * GET /api/v1/appointments — liste filtrée + paginée. Au moins un filtre
   * (`citizenId` ou `centerId`) est REQUIS : pas de vidage global de la base.
   */
  @Get()
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Liste les rendez-vous (filtre citoyen/centre requis, paginé).' })
  list(@Query() q: ListAppointmentsQuery) {
    return this.service.list({
      citizenId: q.citizenId,
      status: q.status,
      centerId: q.centerId,
      page: q.page,
      pageSize: q.pageSize,
    });
  }

  /**
   * POST /api/v1/appointments/me — le citoyen prend RDV pour LUI-MÊME.
   *
   * Self-service : le `citizenId` est dérivé du NINA porté par le token (jamais
   * fourni par le client → anti-IDOR). C'est le pendant citoyen de `POST /` (médié
   * par le personnel) ; il ne relâche PAS la contrainte d'ADR-028 (le citoyen ne
   * peut agir que pour lui-même), à l'image de `POST /corrections` (identity).
   */
  @Post('me')
  @Roles(UserRole.CITIZEN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Prise de rendez-vous par le citoyen lui-même (self-service).' })
  createMine(@Body() dto: CreateSelfAppointmentDto, @CurrentUser() user: AuthSubject) {
    return this.service.createForCitizen(user.nina, {
      centerId: dto.centerId,
      slot: dto.slot,
      reason: dto.reason,
      vulnerabilityCategory: dto.vulnerabilityCategory,
    });
  }

  /**
   * GET /api/v1/appointments/me — les rendez-vous du citoyen authentifié.
   * Portée dérivée du NINA du token ; un `citizenId` de requête serait ignoré.
   * (Déclaré AVANT `:id` pour ne pas être capté par le paramètre.)
   */
  @Get('me')
  @Roles(UserRole.CITIZEN)
  @ApiOperation({ summary: 'Liste des rendez-vous du citoyen authentifié (self-scoped).' })
  listMine(@CurrentUser() user: AuthSubject, @Query() q: ListAppointmentsQuery) {
    return this.service.listForCitizen(user.nina, {
      status: q.status,
      page: q.page,
      pageSize: q.pageSize,
    });
  }

  /** PUT /api/v1/appointments/me/:id/cancel — annulation d'un RDV du citoyen (contrôle de propriété). */
  @Put('me/:id/cancel')
  @Roles(UserRole.CITIZEN)
  @ApiOperation({
    summary: 'Annule un rendez-vous du citoyen authentifié (ownership fail-closed).',
  })
  cancelMine(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthSubject) {
    return this.service.cancelForCitizen(id, user.nina);
  }

  /** GET /api/v1/appointments/queue/:centerId — file d'attente du jour (AGENT). */
  @Get('queue/:centerId')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'File d’attente virtuelle d’un centre pour un jour (vue agent).' })
  queue(@Param('centerId', new ParseUUIDPipe()) centerId: string, @Query('date') date?: string) {
    return this.service.getCenterQueue(centerId, date);
  }

  /** GET /api/v1/appointments/:id — détail. */
  @Get(':id')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Détail d’un rendez-vous.' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  /** PUT /api/v1/appointments/:id/cancel — annulation. */
  @Put(':id/cancel')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Annule un rendez-vous.' })
  cancel(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.cancel(id);
  }

  /** PUT /api/v1/appointments/:id/check-in — arrivée au centre (AGENT). */
  @Put(':id/check-in')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Enregistre l’arrivée du citoyen et l’entrée en file (numéro).' })
  checkIn(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthSubject) {
    return this.service.checkIn(id, actor);
  }

  /** PUT /api/v1/appointments/:id/complete — clôture (AGENT). */
  @Put(':id/complete')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Clôture un rendez-vous servi.' })
  complete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() actor: AuthSubject) {
    return this.service.complete(id, actor);
  }
}
