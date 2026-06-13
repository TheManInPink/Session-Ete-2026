/**
 * @file        proxy.controller.ts
 * @description Controller catch-all qui intercepte TOUTES les requêtes
 *              `/api/v1/*` non capturées par un controller plus spécifique
 *              (health, gateway-meta) et les délègue au {@link ProxyService}.
 *
 *              POURQUOI catch-all : éviter de déclarer une route par préfixe.
 *              La table de routage statique (proxy.routes.ts) est l'unique
 *              source de vérité.
 *
 *              AUTHENTIFICATION : déléguée en amont à {@link GatewayAuthGuard}
 *              (APP_GUARD global). Quand on arrive ici, la requête est soit
 *              publique, soit déjà authentifiée — `req.gatewayUser` et
 *              `req.userContextJws` sont renseignés le cas échéant. Le controller
 *              ne (re)vérifie plus aucun token.
 *
 *              ⚠️  Ce controller DOIT être enregistré APRÈS health & gateway-meta
 *              (garanti par l'ordre d'`imports` d'AppModule — ProxyModule en
 *              dernier) sans quoi son `@All('*')` capterait leurs routes.
 *
 * @module      api-gateway/proxy
 */

import { All, Controller, HttpException, HttpStatus, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

import type { GatewayRequest } from '../../auth/gateway-request.js';
import { matchRoute } from './proxy.routes.js';
import { ProxyService } from './proxy.service.js';

/**
 * Controller volontairement EXCLU de Swagger natif : ses chemins réels sont
 * documentés par la spec AGRÉGÉE (cf. AggregatorService / gateway-meta).
 */
@ApiExcludeController()
@Controller()
export class ProxyController {
  constructor(
    private readonly proxy: ProxyService,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {}

  /**
   * Route catch-all. Match toutes les méthodes HTTP sur tous les chemins
   * `/api/v1/*` restants. Le préfixe global `api/v1` est appliqué par Nest, donc
   * `@All('*')` ne capture QUE les chemins sous `/api/v1`.
   *
   * @throws HttpException(404, E_GW_NOT_FOUND) si aucune route ne matche.
   */
  @All('*')
  async handle(@Req() req: GatewayRequest, @Res() res: Response): Promise<void> {
    const path = req.originalUrl.split('?')[0] ?? req.path;
    const route = matchRoute(path);

    // Pas de route → 404 normalisée (l'auth a déjà laissé passer les inconnus).
    if (!route) {
      this.logger.warn({ method: req.method, path }, 'Aucune route gateway pour ce chemin');
      throw new HttpException(
        { code: 'E_GW_NOT_FOUND', message: 'Endpoint inconnu', details: { path } },
        HttpStatus.NOT_FOUND,
      );
    }

    // Forward — l'identité (si présente) a été établie par le guard.
    const downstream = await this.proxy.forward(route, {
      method: req.method,
      path,
      headers: req.headers,
      body: req.body,
      query: req.query as Record<string, unknown>,
      ...(req.gatewayUser
        ? { userId: req.gatewayUser.userId, userRole: req.gatewayUser.role }
        : {}),
      ...(req.userContextJws ? { userContextJws: req.userContextJws } : {}),
    });

    // Recopie des headers utiles (pas Content-Length, recalculé par Express).
    for (const [k, v] of Object.entries(downstream.headers)) {
      if (k.toLowerCase() === 'content-length') continue;
      res.setHeader(k, v);
    }

    res.status(downstream.status).send(downstream.body);
  }
}
