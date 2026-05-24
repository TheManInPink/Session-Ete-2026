/**
 * @file        proxy.controller.ts
 * @description Controller catch-all qui intercepte TOUTES les requêtes /api/v1/*
 *              et les délègue au ProxyService.
 *
 *              POURQUOI catch-all : éviter de déclarer une route par préfixe.
 *              La table de routage statique (proxy.routes.ts) est l'unique
 *              source de vérité.
 *
 * @module      api-gateway/proxy
 */

import {
  All,
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

import { isPublicEndpoint, matchRoute } from './proxy.routes.js';
import { ProxyService } from './proxy.service.js';

/**
 * Controller volontairement EXCLU de Swagger (le manifest est agrégé depuis
 * les services aval — voir aggregator.service.ts).
 *
 * Le @Controller() sans préfixe combiné au @All('*') capture TOUTES les
 * requêtes non matchées par d'autres controllers (notamment /health qui
 * est plus haut dans la priorité Nest).
 */
@ApiExcludeController()
@Controller()
export class ProxyController {
  constructor(
    private readonly proxy: ProxyService,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {}

  /**
   * Route catch-all. Match toutes les méthodes HTTP sur tous les chemins.
   *
   * NOTE : on n'utilise pas @Get/@Post/etc. séparés pour rester DRY.
   * Nest n'a pas de @All pur sans path, on utilise @All('*').
   */
  @All('*')
  async handle(
    @Req() req: Request,
    @Res() res: Response,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
  ): Promise<void> {
    const path = req.originalUrl.split('?')[0] ?? req.path;
    const route = matchRoute(path);

    // Cas 1 : pas de route → 404 normalisée
    if (!route) {
      this.logger.warn({ method: req.method, path }, 'Aucune route gateway pour ce chemin');
      throw new HttpException(
        {
          code: 'E_GW_NOT_FOUND',
          message: 'Endpoint inconnu',
          details: { path },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // Cas 2 : route trouvée mais privée → vérification JWT
    // NOTE MVP : la vérification JWT complète sera ajoutée dans une passe
    // ultérieure (Prompt 3.3 — auth-service). Pour l'instant on extrait
    // le user du header Authorization si présent, sans le valider.
    const isPublic = isPublicEndpoint(path, route);
    let userId: string | undefined;
    let userRole: string | undefined;

    if (!isPublic) {
      const auth = headers['authorization'];
      const authStr = Array.isArray(auth) ? auth[0] : auth;
      if (!authStr?.startsWith('Bearer ')) {
        throw new HttpException(
          {
            code: 'E_GW_004',
            message: 'Token JWT requis',
            details: { path },
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      // TODO Prompt 3.3 : valider le JWT via JWKS Keycloak ici.
      // Pour le MVP, on décode sans vérification (UNIQUEMENT pour le routing).
      // ⚠️ Ne JAMAIS laisser cette branche en production sans vérif réelle.
      try {
        const payload = JSON.parse(
          Buffer.from(authStr.split('.')[1] ?? '', 'base64url').toString('utf-8'),
        ) as { sub?: string; role?: string };
        userId = payload.sub;
        userRole = payload.role;
      } catch {
        // JWT malformé — refus
        throw new HttpException(
          { code: 'E_GW_004', message: 'Token JWT malformé' },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    // Cas 3 : forward
    const downstream = await this.proxy.forward(route, {
      method: req.method,
      path,
      headers,
      body,
      query,
      userId,
      userRole,
    });

    // Recopie des headers utiles (pas Content-Length, recalculé par Express).
    for (const [k, v] of Object.entries(downstream.headers)) {
      if (k.toLowerCase() === 'content-length') continue;
      res.setHeader(k, v);
    }

    res.status(downstream.status).send(downstream.body);
  }
}
