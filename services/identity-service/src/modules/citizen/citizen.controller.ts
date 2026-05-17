/**
 * @file        citizen.controller.ts
 * @description Controller REST des citoyens NINA.
 *
 *              Routes :
 *                GET    /api/v1/citizens/:nina          (cache Redis 5min)
 *                GET    /api/v1/citizens/by-id/:id
 *                GET    /api/v1/citizens                (search + pagination)
 *                POST   /api/v1/citizens                (rôle AGENT+)
 *                PUT    /api/v1/citizens/:id            (rôle AGENT+)
 *                DELETE /api/v1/citizens/:id            (rôle ADMIN seul, soft delete)
 *
 * @module      identity-service/citizen
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@nina-aes/shared-types';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CacheKey,
  CacheTtl,
  RedisCacheInterceptor,
} from '../../common/interceptors/redis-cache.interceptor';
import { CreateCitizenDto, SearchCitizenDto, UpdateCitizenDto } from './dto/citizen.dto';
import { CitizenService } from './citizen.service';

@ApiTags('citizens')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Controller('citizens')
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  // ─── GET /citizens/:nina ──────────────────────────────────────
  @Get(':nina')
  @ApiOperation({ summary: 'Récupère un citoyen par son NINA (cache 5 min)' })
  @ApiParam({ name: 'nina', example: '18903102015042V' })
  @ApiOkResponse({ description: 'Citoyen trouvé' })
  @ApiResponse({ status: 404, description: 'NINA inconnu' })
  @UseInterceptors(RedisCacheInterceptor)
  @CacheKey('citizens:byNina')
  @CacheTtl(300)
  async findByNina(@Param('nina') nina: string): Promise<unknown> {
    return this.citizenService.findByNina(nina);
  }

  // ─── GET /citizens/by-id/:id ──────────────────────────────────
  @Get('by-id/:id')
  @ApiOperation({ summary: 'Récupère un citoyen par son UUID interne' })
  async findById(@Param('id') id: string): Promise<unknown> {
    return this.citizenService.findById(id);
  }

  // ─── GET /citizens?search=...&page=...&pageSize=... ──────────
  @Get()
  @ApiOperation({ summary: 'Recherche paginée avec fuzzy search + filtres' })
  async search(@Query() dto: SearchCitizenDto): Promise<unknown> {
    return this.citizenService.search(dto);
  }

  // ─── POST /citizens ──────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Crée un nouvel enregistrement NINA' })
  @ApiResponse({ status: 201, description: 'Citoyen créé' })
  @ApiResponse({ status: 409, description: 'NINA déjà existant' })
  async create(
    @Body() dto: CreateCitizenDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.citizenService.create(dto, user.id);
  }

  // ─── PUT /citizens/:id ───────────────────────────────────────
  @Put(':id')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Met à jour un citoyen (verrou optimiste version++)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCitizenDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.citizenService.update(id, dto, user.id);
  }

  // ─── DELETE /citizens/:id (soft delete, ADMIN seul) ──────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete (jamais hard) — réservé ADMIN' })
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; deletedAt: Date }> {
    return this.citizenService.softDelete(id, user.id);
  }
}
