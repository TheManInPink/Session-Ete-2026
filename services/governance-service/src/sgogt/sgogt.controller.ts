/**
 * @file        sgogt.controller.ts
 * @description API REST de la messagerie officielle SGOGT (Bloc C2). Toutes les
 *              routes exigent un JWT + un rôle institutionnel ; JAMAIS d'accès
 *              public. L'authentification (Jwt+Roles+Throttler) est posée
 *              GLOBALEMENT via les `APP_GUARD` de l'AppModule (fail-closed) ; ici
 *              seuls les `@Roles(...)` par route restreignent davantage.
 *              L'émetteur est TOUJOURS l'utilisateur authentifié (jamais un
 *              `senderId` client → anti-usurpation). Anti-IDOR appliqué dans le
 *              service (lecture/ACK/réponse réservés au destinataire).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/sgogt
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@nina-aes/auth-guards';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { GovAuthSubject } from '../auth/auth.types.js';
import { SGOGT_ROLES } from '../common/governance.roles.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  respondMessageSchema,
  sendMessageSchema,
  type RespondMessageDto,
  type SendMessageDto,
} from './dto/sgogt.schema.js';
import { SgogtService } from './sgogt.service.js';

@ApiTags('sgogt')
@ApiBearerAuth()
@Controller('sgogt')
export class SgogtController {
  constructor(private readonly service: SgogtService) {}

  /** POST /api/v1/sgogt/messages — émet un message officiel SIGNÉ (JWS RS256). */
  @Post('messages')
  @Roles(...SGOGT_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Émet un message SGOGT signé (non-répudiation + escalade).' })
  send(
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
    @CurrentUser() actor: GovAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.send(dto, actor, req.ip);
  }

  /** GET /api/v1/sgogt/messages — boîte de réception du destinataire (anti-IDOR). */
  @Get('messages')
  @Roles(...SGOGT_ROLES)
  @ApiOperation({ summary: 'Boîte de réception (messages adressés à l’utilisateur).' })
  inbox(
    @CurrentUser() actor: GovAuthSubject,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.inbox(actor, page ? Number(page) : 1, pageSize ? Number(pageSize) : 50);
  }

  /** GET /api/v1/sgogt/messages/:id/verify — vérifie la signature (contrôle). */
  @Get('messages/:id/verify')
  @Roles(...SGOGT_ROLES, 'auditor')
  @ApiOperation({ summary: 'Vérifie la signature + cohérence claims↔colonnes d’un message.' })
  async verify(@Param('id', new ParseUUIDPipe()) id: string) {
    return { valid: await this.service.verify(id) };
  }

  /** POST /api/v1/sgogt/messages/:id/ack — accusé de réception SIGNÉ (lecteur). */
  @Post('messages/:id/ack')
  @Roles(...SGOGT_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accuse réception (ACK signé par le lecteur, anti-IDOR).' })
  ack(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: GovAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.acknowledge(id, actor, req.ip);
  }

  /** POST /api/v1/sgogt/messages/:id/respond — répond (clôt la décision). */
  @Post('messages/:id/respond')
  @Roles(...SGOGT_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Répond à un message (nouveau message signé du même fil).' })
  respond(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(respondMessageSchema)) dto: RespondMessageDto,
    @CurrentUser() actor: GovAuthSubject,
    @Req() req: Request,
  ) {
    return this.service.respond(id, dto, actor, req.ip);
  }
}
