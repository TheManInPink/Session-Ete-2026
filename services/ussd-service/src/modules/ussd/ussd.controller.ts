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
 *              repose sur :
 *              1. Allowlist IP (à configurer côté NGINX / api-gateway en
 *                 amont — pas dans ce controller)
 *              2. Validation HMAC du payload via header X-AT-Signature
 *                 (TODO 2e passe — Prompt 3.9)
 *              3. Rate limiting agressif (10 sessions/min/numéro)
 *
 * @module      ussd-service/ussd
 */

import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { UssdCallbackDto } from './dto/callback.dto.js';
import { UssdService } from './ussd.service.js';

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
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain')
  @ApiOperation({
    summary: "Webhook Africa's Talking",
    description: 'Endpoint PUBLIC (pas de JWT). À sécuriser par IP allowlist + HMAC.',
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
   * Accessible uniquement aux développeurs (à protéger par rôle ADMIN
   * dans la 2e passe).
   */
  @Get('ussd/sessions/:id')
  @ApiOperation({ summary: 'Debug — consulter une session active' })
  @ApiResponse({ status: 200, description: 'Session ou null' })
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
