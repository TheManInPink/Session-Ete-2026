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
import { JwtAuthGuard, Roles, RolesGuard, type AuthSubject } from '@nina-aes/auth-guards';
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
  ) {}

  /**
   * Génère une nouvelle Fiche Descriptive Individuelle (PDF + QR JWT RS256).
   */
  @Post('fdi')
  @Roles('citizen', 'agent', 'admin')
  @ApiOperation({ summary: 'Génère une FDI (PDF/A-3b + QR JWT signé RS256)' })
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
    const user = req.user as AuthSubject;
    return this.fdi.generate({
      nina: body.nina,
      language: body.language,
      requesterId: user.userId,
      requesterIp: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  /**
   * Génère une URL pré-signée MinIO (1h) pour télécharger un PDF FDI existant.
   */
  @Get(':id/download-url')
  @Roles('citizen', 'agent', 'admin')
  @ApiOperation({ summary: 'URL pré-signée MinIO (1h) pour télécharger une FDI' })
  @ApiParam({ name: 'id', description: 'UUID interne du Document' })
  async downloadUrl(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ url: string; expiresInSec: number }> {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} introuvable`);
    const url = await this.storage.presignDownload(doc.minioObjectKey, doc.minioBucket);
    // Journalisation de l'accès (append-only)
    await prisma.documentAccessLog.create({
      data: {
        documentId: doc.id,
        action: 'DOWNLOAD',
        ipAddress: 'n/a',
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
    const user = req.user as AuthSubject;
    return this.fdi.revoke({
      documentId: id,
      reason: body.reason,
      reasonText: body.reasonText,
      revokedBy: user.userId,
    });
  }
}
