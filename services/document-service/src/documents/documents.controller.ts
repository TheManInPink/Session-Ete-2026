/**
 * @file        documents.controller.ts
 * @description Endpoints privés (JWT requis) — émission, download URL,
 *              révocation. La vérification publique du QR est dans
 *              {@link PublicDocumentsController}.
 *
 * @module      document-service/documents
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '@nina-aes/auth-guards';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { DocumentOwnershipService } from '../auth/document-ownership.guard';
import type { AuthSubjectWithNina } from '../auth/request-user';
import { prisma } from '@nina-aes/database';
import type { Request } from 'express';
import { FdiService } from '../fdi/fdi.service';
import { MinioService } from '../storage/minio.service';
import { GenerateFdiSchema, type GenerateFdiInput } from './dto/generate-fdi.dto';
import { RevokeSchema, type RevokeInput } from './dto/revoke.dto';
import { ZodBodyPipe } from './zod-validation.pipe';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly fdi: FdiService,
    private readonly storage: MinioService,
    private readonly ownership: DocumentOwnershipService,
  ) {}

  /**
   * Génère une nouvelle Fiche Descriptive Individuelle (PDF + QR JWT RS256).
   *
   * 🔒 DURCISSEMENT P1 — anti-IDOR (OWASP A01:2021) : l'émission est gardée par
   * un contrôle d'ownership SYMÉTRIQUE à `downloadUrl`, exécuté AVANT
   * `this.fdi.generate(...)` (fail-closed). Auparavant tout citoyen authentifié
   * pouvait émettre la FDI d'un NINA ARBITRAIRE et recevait en un seul appel :
   * (a) un `qrJwt` exposant la PII complète du tiers (nom, date/lieu de
   * naissance, sexe, hash biométrique), (b) un `downloadUrl` MinIO pré-signé
   * (1 h) vers le PDF officiel d'autrui. Ce mint contournait totalement
   * l'anti-IDOR du GET `:id/download-url` ET le `NinaOwnershipGuard`
   * d'identity-service (l'appel inter-service est un canal interne de confiance
   * — mTLS, ADR-034 — qui ne re-vérifie pas l'ownership de l'APPELANT ; cf.
   * `IdentityClient`). Le contrôle d'ownership est donc rendu côté
   * document-service, qui est la frontière d'autorisation de facto pour l'accès
   * PII par NINA. Le refus est journalisé (append-only) avec l'IP RÉELLE.
   */
  @Post('fdi')
  @Roles('citizen', 'agent', 'admin')
  @ApiOperation({ summary: 'Génère une FDI (PDF/A-3b + QR JWT signé RS256) — ownership requis' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        nina: { type: 'string', example: '19850315123456A' },
        language: { type: 'string', enum: ['fra', 'bam', 'snk', 'fuv'], default: 'fra' },
      },
      required: ['nina'],
    },
  })
  @UsePipes()
  async generate(
    @Body(new ZodBodyPipe(GenerateFdiSchema)) body: GenerateFdiInput,
    @Req() req: Request,
  ): Promise<{
    documentId: string;
    serialNumber: string;
    jti: string;
    sha256Pdf: string;
    qrJwt: string;
    downloadUrl: string;
    expiresAt: string;
  }> {
    const user = req.user as AuthSubjectWithNina;
    const ipAddress = req.ip ?? 'unknown';

    // ⛔ Ownership AVANT toute génération (fail-closed) : le NINA cible est
    // fourni dans le body, donc connu AVANT le fetch identity-service. Un
    // citoyen ne peut émettre QUE sa propre FDI ; agent/supervisor/admin/auditor
    // gardent l'accès transverse (besoin métier, audité). Sur refus, on
    // journalise la tentative (anti-fraude) — `documentId: null` car aucun
    // Document n'est encore matérialisé — puis on relaie le 403.
    try {
      this.ownership.assertCanAccess(user, body.nina);
    } catch (err) {
      await prisma.documentAccessLog.create({
        data: {
          documentId: null,
          action: 'DOWNLOAD',
          ipAddress,
          userAgent: req.headers['user-agent'] ?? null,
          result: 'FAILURE',
          reasonCode: 'FORBIDDEN_OWNERSHIP',
        },
      });
      throw err;
    }

    return this.fdi.generate({
      nina: body.nina,
      language: body.language,
      requesterId: user.userId,
      requesterIp: ipAddress,
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  /**
   * Génère une URL pré-signée MinIO (1h) pour télécharger un PDF FDI existant.
   *
   * 🔒 DURCISSEMENT P1 — anti-IDOR (A01) : la pré-signature n'est délivrée
   * qu'au PROPRIÉTAIRE (citoyen dont le claim `nina` == celui du Document) OU à
   * un rôle privilégié habilité (agent/supervisor/admin/auditor). Le contrôle
   * d'ownership s'exécute AVANT toute génération d'URL — auparavant n'importe
   * quel citoyen authentifié pouvait pré-signer la FDI d'autrui en devinant
   * l'UUID. L'accès (succès ET refus) est journalisé avec l'IP RÉELLE.
   */
  @Get(':id/download-url')
  @Roles('citizen', 'agent', 'admin')
  @ApiOperation({
    summary: 'URL pré-signée MinIO (1h) pour télécharger une FDI (ownership requis)',
  })
  @ApiParam({ name: 'id', description: 'UUID interne du Document' })
  async downloadUrl(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ): Promise<{ url: string; expiresInSec: number }> {
    const user = req.user as AuthSubjectWithNina;
    const ipAddress = req.ip ?? 'unknown';

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);

    // ⛔ Ownership AVANT toute pré-signature (fail-closed). Sur refus, on
    // journalise la tentative (anti-fraude) puis on relaie le 403.
    try {
      this.ownership.assertCanAccess(user, doc.nina);
    } catch (err) {
      await prisma.documentAccessLog.create({
        data: {
          documentId: doc.id,
          action: 'DOWNLOAD',
          ipAddress,
          userAgent: req.headers['user-agent'] ?? null,
          result: 'FAILURE',
          reasonCode: 'FORBIDDEN_OWNERSHIP',
        },
      });
      throw err;
    }

    const url = await this.storage.presignDownload(doc.minioObjectKey, doc.minioBucket);
    // Journalisation de l'accès (append-only) — IP réelle (plus de placeholder).
    await prisma.documentAccessLog.create({
      data: {
        documentId: doc.id,
        action: 'DOWNLOAD',
        ipAddress,
        userAgent: req.headers['user-agent'] ?? null,
        result: 'SUCCESS',
      },
    });
    return { url, expiresInSec: 3600 };
  }

  /**
   * Révoque une FDI émise (action irréversible). Le `jti` est ajouté à la
   * liste de révocation Redis, le verify-qr public retournera REVOKED.
   */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Révoque une FDI (irréversible — append-only DB)' })
  @ApiParam({ name: 'id', description: 'UUID interne du Document' })
  async revoke(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodBodyPipe(RevokeSchema)) body: RevokeInput,
    @Req() req: Request,
  ): Promise<{ revoked: true; jti: string } | { alreadyRevoked: true }> {
    const user = req.user as AuthSubjectWithNina;
    return this.fdi.revoke({
      documentId: id,
      reason: body.reason,
      reasonText: body.reasonText,
      revokedBy: user.userId,
    });
  }
}
