/**
 * @file        audit.controller.ts
 * @description API REST de preuve cryptographique. Toutes les routes exigent un
 *              JWT (JwtAuthGuard) + un rôle (RolesGuard). Les endpoints coûteux
 *              (verify, export, proof) sont rate-limités (ThrottlerGuard).
 *
 *              Ordre des routes : les chemins littéraux (verify, export,
 *              roots/latest) et `:id/proof` sont déclarés AVANT `:id` pour ne
 *              pas être capturés par le paramètre générique.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Roles, UserRole } from '@nina-aes/auth-guards';
import { Prisma } from '@nina-aes/database';
import type { Response } from 'express';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { AuditService } from './audit.service.js';
import type { NormalizedAuditEvent } from './audit.normalizer.js';
import { IngestEventDto } from './dtos/ingest.dto.js';
import { QueryAuditDto, VerifyRangeDto } from './dtos/query.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** POST /api/v1/audit — ingestion synchrone (services internes m2m). */
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crée une entrée d audit (chaînée). Idempotent via sourceEventId.' })
  @ApiCreatedResponse({ description: 'Entrée créée (ou existante si doublon).' })
  async create(@Body() dto: IngestEventDto) {
    const event: NormalizedAuditEvent = {
      userId: dto.userId ?? null,
      actorType: dto.actorType ?? 'SYSTEM',
      action: dto.action,
      entityType: dto.entityType ?? 'event',
      entityId: dto.entityId ?? null,
      oldValue: dto.oldValue ?? null,
      newValue: dto.newValue ?? null,
      ipAddress: dto.ipAddress ?? null,
      correlationId: dto.correlationId ?? null,
      sourceEventId: dto.sourceEventId ?? randomUUID(),
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    };
    try {
      const { log, duplicate } = await this.audit.appendOne(event);
      return { duplicate, log: { ...log, id: log.id.toString() } };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException('userId référence un utilisateur interne inconnu.');
      }
      throw err;
    }
  }

  /** GET /api/v1/audit — recherche paginée filtrée. */
  @Get()
  @Roles(UserRole.AUDITOR, UserRole.ADMIN, UserRole.ANTICORRUPTION_INSPECTOR)
  @ApiOperation({ summary: 'Recherche paginée des logs (filtres userId/action/entity/dates).' })
  async list(@Query() q: QueryAuditDto) {
    return this.audit.list({
      userId: q.userId,
      action: q.action,
      entityType: q.entityType,
      entityId: q.entityId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      skip: q.skip,
      take: q.take,
    });
  }

  /** GET /api/v1/audit/verify — vérification d'intégrité d'un intervalle. */
  @Get('verify')
  @Roles(UserRole.AUDITOR, UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Vérifie l intégrité de la chaîne sur [from, to] (ids).' })
  @ApiOkResponse({
    description: '{ valid, entriesChecked, brokenAt?, expectedHash?, actualHash? }',
  })
  async verify(@Query() q: VerifyRangeDto) {
    return this.audit.verifyRange(BigInt(q.from), BigInt(q.to));
  }

  /** GET /api/v1/audit/export — export CSV + signature détachée Ed25519. */
  @Get('export')
  @Roles(UserRole.AUDITOR, UserRole.ADMIN)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exporte les logs filtrés en CSV signé (Ed25519 dans les en-têtes).' })
  async export(
    @Query() q: QueryAuditDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const result = await this.audit.exportCsv({
      userId: q.userId,
      action: q.action,
      entityType: q.entityType,
      entityId: q.entityId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
    const filename = `audit-export-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Audit-Signature', result.signature);
    res.setHeader('X-Audit-Signing-Key-Id', result.signingKeyId);
    res.setHeader('X-Audit-Public-Key', result.publicKey);
    res.setHeader('X-Audit-Row-Count', String(result.rowCount));
    res.setHeader('X-Audit-Truncated', String(result.truncated));
    res.status(HttpStatus.OK).send(result.csv);
  }

  /** GET /api/v1/audit/roots/latest — dernière racine scellée. */
  @Get('roots/latest')
  @Roles(UserRole.AUDITOR, UserRole.ADMIN, UserRole.ANTICORRUPTION_INSPECTOR)
  @ApiOperation({ summary: 'Dernière racine scellée Ed25519 + clé publique.' })
  async latestRoot() {
    return this.audit.latestRoot();
  }

  /** GET /api/v1/audit/:id/proof — preuve cryptographique d'un log. */
  @Get(':id/proof')
  @Roles(UserRole.AUDITOR, UserRole.ADMIN, UserRole.ANTICORRUPTION_INSPECTOR)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Preuve : log + chaîne jusqu à la racine scellée signée.' })
  async proof(@Param('id') id: string) {
    const proof = await this.audit.getProof(this.parseBigId(id));
    if (!proof) throw new NotFoundException('Log introuvable');
    return proof;
  }

  /** GET /api/v1/audit/:id — lecture d'un log. */
  @Get(':id')
  @Roles(UserRole.AUDITOR, UserRole.ADMIN, UserRole.ANTICORRUPTION_INSPECTOR)
  @ApiOperation({ summary: 'Lit un log par id.' })
  async findOne(@Param('id') id: string) {
    const log = await this.audit.findById(this.parseBigId(id));
    if (!log) throw new NotFoundException('Log introuvable');
    return log;
  }

  /** Convertit un id de chemin en BigInt (les ids dépassent Number.MAX_SAFE_INTEGER). */
  private parseBigId(id: string): bigint {
    if (!/^\d+$/.test(id)) throw new BadRequestException('id invalide');
    return BigInt(id);
  }
}
