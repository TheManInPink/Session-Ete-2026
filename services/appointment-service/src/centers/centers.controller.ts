/**
 * @file        centers.controller.ts
 * @description API REST des centres d'enrôlement. Lecture seule et PUBLIQUE :
 *              un citoyen (web, USSD, borne) doit pouvoir consulter les centres
 *              et leurs disponibilités AVANT de s'authentifier. Reste protégé
 *              par le throttler. Aucune donnée personnelle n'est exposée ici.
 *
 *              Ordre des routes : `suggest` (littéral) déclaré AVANT `:id` pour
 *              éviter la capture par le paramètre ; `:id` est en plus contraint
 *              en UUID.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '@nina-aes/auth-guards';
import { CentersService } from './centers.service.js';
import { ListCentersQuery } from './dto/list-centers.query.js';
import { AvailabilityQuery } from './dto/availability.query.js';
import { SuggestQuery } from './dto/suggest.query.js';

@ApiTags('centers')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('centers')
export class CentersController {
  constructor(private readonly service: CentersService) {}

  /** GET /api/v1/centers — liste filtrable (région, cercle, service, ouvert, géo). */
  @Get()
  @ApiOperation({ summary: 'Liste des centres d’enrôlement (filtres + recherche géographique).' })
  @ApiOkResponse({ description: 'Centres correspondant aux filtres (triés par distance si géo).' })
  list(@Query() q: ListCentersQuery) {
    return this.service.listCenters({
      regionCode: q.region,
      cercleCode: q.cercle,
      service: q.service,
      openNow: q.openNow,
      lat: q.lat,
      lng: q.lng,
      radiusKm: q.radius,
    });
  }

  /** GET /api/v1/centers/suggest — centre le plus proche avec créneau disponible. */
  @Get('suggest')
  @ApiOperation({ summary: 'Suggère le(s) centre(s) le(s) plus proche(s) avec un créneau libre.' })
  suggest(@Query() q: SuggestQuery) {
    return this.service.suggest({
      lat: q.lat,
      lng: q.lng,
      from: q.from,
      to: q.to,
      priority: q.priority,
      service: q.service,
    });
  }

  /** GET /api/v1/centers/:id — détail d'un centre (horaires, capacité, services). */
  @Get(':id')
  @ApiOperation({
    summary: 'Détail d’un centre (horaires, capacité, quotas, fenêtre prioritaire).',
  })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getCenter(id);
  }

  /** GET /api/v1/centers/:id/availability — créneaux STANDARD/PRIORITAIRE par jour. */
  @Get(':id/availability')
  @ApiOperation({ summary: 'Disponibilités d’un centre (créneaux STANDARD vs PRIORITAIRE).' })
  availability(@Param('id', new ParseUUIDPipe()) id: string, @Query() q: AvailabilityQuery) {
    return this.service.getAvailability(id, q.from, q.to);
  }
}
