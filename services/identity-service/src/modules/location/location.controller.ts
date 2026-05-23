/**
 * @file        location.controller.ts
 * @description Référentiel géographique Mali — endpoints publics (lecture seule).
 *
 *              Routes :
 *                GET /api/v1/locations?level=&parent=
 *                GET /api/v1/locations/search?q=
 *                GET /api/v1/locations/:id  (avec chaîne d'ancêtres)
 *
 * @module      identity-service/location
 */

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListLocationsDto, SearchLocationDto } from './dto/location.dto';
import { LocationService } from './location.service';

@ApiTags('locations')
@Controller('locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  // ─── GET /locations ──────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Hiérarchie géographique Mali (filtrable par niveau et parent)' })
  @ApiOkResponse({ description: 'Liste de Locations triée par nom' })
  async list(@Query() dto: ListLocationsDto): Promise<unknown[]> {
    return this.locationService.list(dto);
  }

  // ─── GET /locations/search ───────────────────────────────────
  @Get('search')
  @ApiOperation({ summary: 'Recherche fuzzy ASCII sur noms et codes (Sikaso → Sikasso)' })
  async search(@Query() dto: SearchLocationDto): Promise<unknown[]> {
    return this.locationService.search(dto);
  }

  // ─── GET /locations/:id ──────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: "Détail Location + chaîne d'ancêtres jusqu'à Mali" })
  async findById(@Param('id') id: string): Promise<unknown> {
    return this.locationService.findById(id);
  }
}
