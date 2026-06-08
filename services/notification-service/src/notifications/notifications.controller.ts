/**
 * @file        notifications.controller.ts
 * @description API REST du notification-service. Toutes les routes (sauf le
 *              webhook DLR) exigent un JWT + un rôle. Le webhook AT est `@Public`
 *              et protégé par un secret partagé optionnel.
 *
 *              Ordre des routes : chemins littéraux (broadcast, templates,
 *              metrics, atalking/callback) AVANT `:id/status` pour éviter la
 *              capture par le paramètre.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/notifications
 */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public, Roles, UserRole } from '@nina-aes/auth-guards';
import type { Env } from '../config/env.schema.js';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { TemplateRenderError } from './templates/template.registry.js';
import { NotificationsService, type ProcessResult } from './notifications.service.js';
import { SendNotificationDto } from './dtos/send.dto.js';
import { BroadcastDto } from './dtos/broadcast.dto.js';
import type { NotificationJob } from './job.types.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly cfg: ConfigService<Env, true>,
  ) {}

  /** POST /api/v1/notifications/send — envoi unique synchrone. */
  @Post('send')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.SUPERVISOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Envoie une notification unique (canal auto ou forcé).' })
  async send(@Body() dto: SendNotificationDto): Promise<Record<string, unknown>> {
    const job: NotificationJob = {
      recipient: dto.recipient,
      channel: dto.channel,
      template: dto.template,
      variables: dto.variables,
      priority: dto.priority,
      language: dto.language,
      recipientUserId: dto.recipientUserId ?? null,
      recipientCitizenId: dto.recipientCitizenId ?? null,
      idempotencyKey: dto.idempotencyKey ?? null,
    };
    try {
      return this.view(await this.service.sendOne(job));
    } catch (err) {
      if (err instanceof TemplateRenderError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /** POST /api/v1/notifications/broadcast — envoi en masse (ADMIN). */
  @Post('broadcast')
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Envoi en masse — publie les jobs sur RabbitMQ (débit régulé).' })
  broadcast(@Body() dto: BroadcastDto) {
    return this.service.broadcast(dto);
  }

  /** GET /api/v1/notifications/templates — catalogue des templates. */
  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Liste les templates disponibles (clés + variables requises).' })
  templates() {
    return this.service.listTemplates();
  }

  /** GET /api/v1/notifications/metrics — métriques opérationnelles. */
  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Métriques : envois/heure, taux de succès par canal, latence.' })
  metrics() {
    return this.service.metricsSnapshot();
  }

  /**
   * POST /api/v1/notifications/atalking/callback — webhook DLR Africa's Talking.
   * Public (AT ne porte pas de JWT) mais protégé par un secret partagé optionnel
   * (`?token=` ou header `x-callback-token`).
   */
  @Public()
  @Post('atalking/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Webhook DLR Africa's Talking (accusé de livraison)." })
  async atalkingCallback(
    @Body() body: Record<string, string>,
    @Query('token') token?: string,
    // Secret accepté aussi via en-tête HTTP `x-callback-token` (réglage AT custom).
    @Headers('x-callback-token') headerToken?: string,
  ): Promise<{ matched: boolean; status?: string }> {
    const secret = this.cfg.get('NOTIFICATION_ATALKING_CALLBACK_SECRET', { infer: true });
    if (secret && secret !== (token ?? headerToken)) {
      throw new ForbiddenException('Secret de callback invalide');
    }
    const providerId = body.id ?? body.messageId;
    const status = body.status;
    if (!providerId || !status) {
      throw new BadRequestException('Champs DLR manquants (id, status)');
    }
    return this.service.handleDlr(providerId, status);
  }

  /** GET /api/v1/notifications/:id/status — statut de livraison. */
  @Get(':id/status')
  @Roles(UserRole.ADMIN, UserRole.AGENT, UserRole.SUPERVISOR, UserRole.AUDITOR)
  @ApiOperation({ summary: 'Statut de livraison d’une notification.' })
  @ApiOkResponse({ description: 'Statut + horodatages + raison d’échec éventuelle.' })
  status(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getStatus(id);
  }

  /** Projette un résultat de traitement en réponse HTTP. */
  private view(r: ProcessResult): Record<string, unknown> {
    return {
      id: r.notification.id,
      status: r.notification.status,
      channel: r.notification.channel,
      providerId: r.notification.providerId,
      deduped: r.deduped,
    };
  }
}
