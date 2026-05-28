/**
 * @file        public-documents.controller.ts
 * @description Endpoint public sans auth pour vérification offline du QR.
 *              Rate-limité 30 req/min/IP (cf. app.module.ts ThrottlerModule).
 *
 * @module      document-service/documents
 */
import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiBody, ApiTags } from '@nestjs/swagger';
import { Public } from '@nina-aes/auth-guards';
import type { Request } from 'express';
import { prisma } from '@nina-aes/database';
import { QrVerifierService } from '../qr/qr-verifier.service';
import { AuditPublisherService } from '../audit/audit-publisher.service';
import { VerifyQrSchema, type VerifyQrInput } from './dto/verify-qr.dto';
import { ZodBodyPipe } from './zod-validation.pipe';
import type { QrVerifyResult } from '../qr/qr-payload.interface';

@ApiTags('public-documents')
@Controller('public/documents')
export class PublicDocumentsController {
  constructor(
    private readonly verifier: QrVerifierService,
    private readonly audit: AuditPublisherService,
  ) {}

  /**
   * Vérifie un token JWT extrait d'un QR de FDI.
   * Latence cible < 50 ms p95 (JWKS cache 24h Redis + Redis SET révocation).
   */
  @Public()
  @Post('verify-qr')
  @ApiOperation({ summary: 'Vérifie un QR FDI (offline-friendly, sans auth)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { token: { type: 'string', example: 'eyJhbGciOiJSUzI1NiIs...' } },
      required: ['token'],
    },
  })
  async verify(
    @Body(new ZodBodyPipe(VerifyQrSchema)) body: VerifyQrInput,
    @Req() req: Request,
  ): Promise<QrVerifyResult> {
    const result = await this.verifier.verify(body.token);

    // Journalisation de l'accès + audit asynchrone (fire-and-forget)
    void prisma.documentAccessLog
      .create({
        data: {
          action: 'VERIFY_QR',
          jti: result.valid ? result.jti : null,
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? null,
          result: result.valid ? 'SUCCESS' : 'FAILURE',
          reasonCode: result.valid ? 'VALID' : result.reasonCode,
        },
      })
      .catch(() => undefined);

    void this.audit.publish('document.qr.verified', {
      jti: result.valid ? result.jti : null,
      result: result.valid ? 'SUCCESS' : 'FAILURE',
      reasonCode: result.valid ? 'VALID' : result.reasonCode,
      ipAddress: req.ip ?? 'unknown',
    });

    return result;
  }
}
