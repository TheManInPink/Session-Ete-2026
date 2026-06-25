/**
 * @file        ussd.controller.ts
 * @description Endpoints HTTP du service USSD.
 *
 *              - POST /ussd/callback : webhook Africa's Talking
 *                  → renvoie text/plain "CON ..." ou "END ..."
 *              - GET  /api/v1/ussd/sessions/:id : debug admin
 *
 *              SÉCURITÉ : le webhook /ussd/callback est PUBLIC (pas de JWT)
 *              car Africa's Talking ne sait pas en envoyer. La sécurité
 *              repose sur (doc 14 §4.2) :
 *              1. `AtAuthenticityGuard` : IP allowlist
 *                 (`AT_GATEWAY_IP_ALLOWLIST`) + secret partagé comparé en TEMPS
 *                 CONSTANT (`AT_WEBHOOK_SHARED_SECRET`) — rejet 403 AVANT tout
 *                 accès PII, fail-closed en production.
 *              2. mTLS terminé en amont (NGINX / api-gateway).
 *              3. Rate-limiting métier par phone ET par NINA (UssdService).
 *
 *              L'endpoint de debug `GET /ussd/sessions/:id` est protégé par
 *              `DebugOnlyGuard` (désactivé hors développement) — fermeture de
 *              l'IDOR documenté (§6).
 *
 * @module      ussd-service/ussd
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { UssdCallbackDto } from './dto/callback.dto.js';
import { UssdService } from './ussd.service.js';
import { AtAuthenticityGuard } from './guards/at-authenticity.guard.js';
import { DebugOnlyGuard } from './guards/debug-only.guard.js';

@ApiTags('ussd')
@Controller()
export class UssdController {
  constructor(private readonly ussdService: UssdService) {}

  /**
   * Webhook Africa's Talking — appelé à chaque interaction utilisateur.
   *
   * IMPORTANT : la route est `/ussd/callback` (sans préfixe `/api/v1`) — c'est
   * un choix de simplicité pour la config opérateur. L'exclusion du préfixe
   * est faite dans `main.ts` via `setGlobalPrefix({ exclude: [...] })`.
   *
   * Le `Content-Type` de la réponse DOIT être `text/plain` — sinon Africa's
   * Talking n'affiche rien à l'utilisateur.
   */
  @Post('/ussd/callback')
  @UseGuards(AtAuthenticityGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain')
  @ApiOperation({
    summary: "Webhook Africa's Talking",
    description:
      'Endpoint PUBLIC (pas de JWT) protégé par AtAuthenticityGuard ' +
      '(IP allowlist + secret partagé, fail-closed en production).',
  })
  @ApiResponse({
    status: 200,
    description: 'Réponse text/plain "CON ..." ou "END ..."',
    schema: { type: 'string', example: 'CON NINA-AES — Menu\\n1. Vérifier...' },
  })
  async callback(@Body() dto: UssdCallbackDto): Promise<string> {
    const result = await this.ussdService.handle(dto);
    return result.text;
  }

  /**
   * Endpoint de debug — récupère l'état d'une session.
   *
   * SÉCURITÉ (anti-IDOR, §6) : `DebugOnlyGuard` rejette l'accès hors
   * développement (403). En production, cet endpoint n'est donc PAS exposé —
   * un `sessionId` deviné ne permet plus de lire l'état d'une session.
   */
  @Get('ussd/sessions/:id')
  @UseGuards(DebugOnlyGuard)
  @ApiOperation({ summary: 'Debug (dev uniquement) — consulter une session active' })
  @ApiResponse({ status: 200, description: 'Session ou null' })
  @ApiResponse({ status: 403, description: 'Désactivé hors développement' })
  getSession(@Param('id') id: string) {
    const session = this.ussdService.getSession(id);
    if (!session) return { exists: false };
    return {
      exists: true,
      sessionId: session.sessionId,
      // ⚠️ phone et data sont masqués via le redact Pino, mais ici on les
      // expose au caller car endpoint de debug. À RESTREINDRE rôle ADMIN
      // dans la 2e passe.
      state: session.state,
      language: session.language,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}
