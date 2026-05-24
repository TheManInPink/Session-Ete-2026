/**
 * @file        correlation.middleware.ts
 * @description Middleware Express/NestJS qui démarre une portée de corrélation
 *              à chaque requête HTTP entrante.
 *
 *              FLUX :
 *              1. Lit le header `X-Request-Id` envoyé par l'api-gateway.
 *              2. Si absent, génère un UUID v7 (cas d'un accès direct au
 *                 service, sans passer par le gateway — typiquement les tests).
 *              3. Ouvre une portée `runWithContext` pour le reste de la chaîne.
 *              4. Propage le `X-Request-Id` dans la réponse — utile pour
 *                 l'utilisateur final qui peut le citer dans un ticket support.
 *
 *              ORDRE DE MONTAGE : ce middleware DOIT être le PREMIER dans la
 *              chaîne (avant body-parser, avant auth, avant tout). Sinon les
 *              logs émis pendant le parsing du body seraient orphelins.
 *
 * @module      @nina-aes/logger/nestjs/correlation.middleware
 */

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { generateCorrelationId, patchContext, runWithContext } from '../correlation.js';
import type { LogContext } from '../types.js';

/**
 * Header HTTP utilisé pour la propagation inter-services.
 * Choix de `X-Request-Id` (lowercase) — convention de fait dans l'écosystème
 * Node/Express et compatible avec les LB (NGINX, Traefik, Envoy).
 */
export const CORRELATION_HEADER = 'x-request-id';

/**
 * Symbole utilisé pour stocker temporairement l'ID dans `req` afin que des
 * intercepteurs ultérieurs puissent y accéder sans réinvoquer `getContext()`.
 */
export const REQ_CORRELATION_KEY = Symbol.for('nina-aes.correlationId');

/**
 * Middleware NestJS exporté nominativement pour être injecté via DI.
 *
 * USAGE dans un module :
 * ```ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     // Premier de la chaîne — ordre critique
 *     consumer.apply(CorrelationMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  /**
   * @param service - Nom du service hébergeant ce middleware (injecté via
   *                  factory dans `LoggerModule.forRoot()`).
   */
  constructor(private readonly service: string) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // 1. Récupère ou génère le correlationId
    const incoming = req.headers[CORRELATION_HEADER];
    const correlationId =
      (Array.isArray(incoming) ? incoming[0] : incoming) ?? generateCorrelationId();

    // 2. Stocke sur req pour usage ultérieur (filters, interceptors)
    (req as unknown as Record<symbol, string>)[REQ_CORRELATION_KEY] = correlationId;

    // 3. Propage en réponse pour que le client puisse le citer
    res.setHeader('x-request-id', correlationId);

    // 4. Ouvre la portée. Tout le reste du pipeline (controllers, services,
    //    appels HTTP sortants, listeners RabbitMQ) bénéficiera de la
    //    corrélation automatique.
    const context: LogContext = {
      correlationId,
      service: this.service,
    };

    runWithContext(context, () => {
      // Si plus tard auth-middleware peuple req.user, on patche le contexte
      // pour enrichir tous les logs suivants.
      const enrichOnAuth = () => {
        const user = (req as Request & { user?: { id?: string; role?: string } }).user;
        if (user?.id) {
          try {
            patchContext({ userId: user.id, userRole: user.role });
          } catch {
            /* contexte déjà fermé — ignore silencieusement */
          }
        }
      };
      // On hook sur la fin de la phase auth via `finish` (express)
      res.on('finish', enrichOnAuth);

      next();
    });
  }
}
