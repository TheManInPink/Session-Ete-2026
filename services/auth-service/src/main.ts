/**
 * @file        main.ts
 * @description Point d'entrée du microservice auth-service.
 *
 *              Bootstrap minimal — toute la config applicative est lue
 *              depuis `ConfigService` (env validée par Zod, cf.
 *              `config/env.config.ts`). Pas de ValidationPipe global :
 *              les DTOs sont validés par `ZodValidationPipe` route-par-route
 *              (le pipe class-validator stripperait silencieusement les
 *              propriétés non-décorées de nos type aliases Zod).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      auth-service
 */

import { Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.config.js';

/**
 * En-têtes de sécurité HTTP (équivalent minimal d'Helmet, sans dépendance
 * supplémentaire — auth-service n'embarque pas `helmet`, cf. doc 08 §0).
 *
 * - `HSTS` : force HTTPS côté navigateur (1 an, sous-domaines) — n'est posé
 *   qu'en production (en dev, HTTP local ne doit pas être épinglé).
 * - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
 *   `Referrer-Policy` : durcissements génériques.
 * - `Content-Security-Policy` restrictive : l'API ne sert que du JSON, aucune
 *   ressource active n'est légitime → `default-src 'none'`.
 *
 * ⏳ Évolution AS-BUILT : aligner sur les 5 autres services en passant à
 *    `helmet` (ajout `helmet` aux deps + `pnpm install`).
 */
function securityHeaders(isProd: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('auth-service');

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppEnv, true>);

  // ─── En-têtes de sécurité (CSP/HSTS/anti-clickjacking) ──────────────
  app.use(securityHeaders(config.get('NODE_ENV', { infer: true }) === 'production'));

  // Préfixe global — santé et JWKS restent à la racine (interop / probes).
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
      { path: '.well-known/jwks.json', method: RequestMethod.GET },
    ],
  });

  // CORS — liste explicite depuis env (vide → toutes origines refusées).
  const corsOrigins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    });
    logger.log(`CORS activé pour : ${corsOrigins.join(', ')}`);
  }

  // Hooks SIGTERM → onModuleDestroy (Prisma disconnect, Redis quit, Vault destroy).
  app.enableShutdownHooks();

  const port = config.get('AUTH_SERVICE_PORT', { infer: true });
  await app.listen(port);
  logger.log(`auth-service démarré sur le port ${port}`);
  logger.log(`JWKS de signature : http://localhost:${port}/.well-known/jwks.json`);
}

void bootstrap();
