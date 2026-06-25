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
import { JwtAuthGuard, RolesGuard, NinaOwnershipGuard } from '../../auth/guards';
import {
  CacheKey,
  CacheTtl,
  RedisCacheInterceptor,
} from '../../common/interceptors/redis-cache.interceptor';
import { CreateCitizenDto, SearchCitizenDto, UpdateCitizenDto } from './dto/citizen.dto';
import { CitizenService } from './citizen.service';

/**
 * Toutes les routes sont AUTHENTIFIÉES (JwtAuthGuard, fail-closed) PUIS
 * autorisées par rôle (RolesGuard). Aucune route citoyen n'est ouverte :
 * lecture par NINA = anti-IDOR (NinaOwnershipGuard), lecture par UUID et
 * recherche = rôles privilégiés uniquement (anti-énumération de la population).
 * Cf. doc 07 §3.3 + THREAT-MODEL (trou d'autorisation P0 fermé).
 */
@ApiTags('citizens')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('citizens')
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  // ─── GET /citizens/:nina (citoyen = SON NINA, sinon agent+) ───
  // Anti-IDOR : un CITIZEN ne lit que son propre NINA (NinaOwnershipGuard) ;
  // agent/supervisor/admin/auditor accèdent à tout dossier (besoin métier).
  @Get(':nina')
  @Roles(UserRole.CITIZEN, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @UseGuards(NinaOwnershipGuard)
  @ApiOperation({ summary: 'Récupère un citoyen par son NINA (cache 5 min)' })
  @ApiParam({ name: 'nina', example: '18903102015042V' })
  @ApiOkResponse({ description: 'Citoyen trouvé' })
  @ApiResponse({ status: 403, description: 'NINA d’autrui (citoyen non propriétaire)' })
  @ApiResponse({ status: 404, description: 'NINA inconnu' })
  @UseInterceptors(RedisCacheInterceptor)
  @CacheKey('citizens:byNina')
  @CacheTtl(300)
  async findByNina(@Param('nina') nina: string): Promise<unknown> {
    return this.citizenService.findByNina(nina);
  }

  // ─── GET /citizens/by-id/:id (rôles privilégiés uniquement) ───
  // PAS ouvert au citoyen : la lecture par UUID interne contournerait
  // l'ownership NINA (un citoyen ne connaît pas son UUID, mais on ferme
  // explicitement la route — défense en profondeur).
  @Get('by-id/:id')
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Récupère un citoyen par son UUID interne (agent+)' })
  async findById(@Param('id') id: string): Promise<unknown> {
    return this.citizenService.findById(id);
  }

  // ─── GET /citizens?search=... (rôles privilégiés uniquement) ──
  // 🔒 JAMAIS ouvert au citoyen : la recherche floue permettrait
  // l'énumération de la population (OWASP A01).
  @Get()
  @Roles(UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Recherche paginée avec fuzzy search + filtres (agent+)' })
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
