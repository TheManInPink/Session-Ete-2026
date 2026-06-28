/**
 * @file        electoral.controller.ts
 * @description API REST de l'intégrité électorale (Bloc C3) — export delta DGE.
 *
 *              Contrôles cumulés (cf. ELECTIONS-EXPORT-CONTRACT) :
 *                - RBAC STRICT `DGE_OFFICIAL` (anti-IDOR A01) ;
 *                - rate-limit PAR IP via le throttler NOMMÉ `dge` (défense en
 *                  profondeur) — DÉCLARÉ dans l'AppModule (sinon inerte) ;
 *                - quota ATOMIQUE PAR COMPTE dans le service (la vraie garantie) ;
 *                - signature RS256 + SHA-256 dans de VRAIS en-têtes HTTP
 *                  (`res.setHeader`, PAS le fantôme `StreamableFile.setMetadata`) ;
 *                - journalisation `DGE_EXPORT` de CHAQUE export.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { Controller, Get, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '@nina-aes/auth-guards';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GovAuthSubject } from '../auth/auth.types.js';
import { GovRole } from '../common/governance.roles.js';
import { ExportService } from './export.service.js';

@ApiTags('elections')
@ApiBearerAuth()
@Controller('elections')
export class ElectoralController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * GET /api/v1/elections/export?since=ISO8601 — export delta signé pour la DGE.
   *
   * Rate-limit anti-exfiltration : au plus 5 exports/h PAR IP (throttler nommé
   * `dge`, déclaré dans l'AppModule). La garantie PAR COMPTE est portée par le
   * quota applicatif atomique (service).
   */
  @Get('export')
  @Roles(GovRole.DGE_OFFICIAL)
  @Throttle({ dge: { ttl: 3_600_000, limit: 5 } })
  @ApiOperation({ summary: 'Export delta électoral signé pour la DGE (rate-limité + audité).' })
  async export(
    @Query('since') sinceIso: string,
    @CurrentUser() actor: GovAuthSubject,
    @Req() req: Request,
    // passthrough: true → on garde la main sur les en-têtes tout en laissant
    // NestJS streamer le StreamableFile retourné.
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.exportService.buildDelta(sinceIso, actor, req.ip);

    // VRAIS en-têtes HTTP (PAS le fantôme setMetadata).
    res.setHeader('X-Export-Signature', result.signatureJws);
    res.setHeader('X-Export-SHA256', result.sha256);
    res.setHeader('X-Export-Count', String(result.count));

    return new StreamableFile(result.buffer, {
      type: 'text/csv',
      disposition: `attachment; filename="${result.filename}"`,
      length: result.buffer.length,
    });
  }
}
