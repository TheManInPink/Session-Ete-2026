import { Controller, Get, Post, Put, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CitizenService } from './citizen.service';

@ApiTags('citizens')
@Controller('api/v1/citizens')
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  @Get(':nina')
  @ApiOperation({ summary: 'Consulter un citoyen par son numéro NINA' })
  @ApiResponse({ status: 200, description: 'Citoyen trouvé' })
  @ApiResponse({ status: 404, description: 'NINA non trouvé' })
  async findByNina(@Param('nina') nina: string) {
    return this.citizenService.findByNina(nina);
  }

  @Get()
  @ApiOperation({ summary: 'Rechercher des citoyens' })
  async search(
    @Query('lastName') lastName?: string,
    @Query('firstName') firstName?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.citizenService.search({ lastName, firstName, page, limit });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un nouvel enregistrement NINA' })
  async create(@Body() data: any) {
    return this.citizenService.create(data);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour un enregistrement NINA' })
  async update(@Param('id') id: string, @Body() data: any) {
    return this.citizenService.update(id, data);
  }
}
