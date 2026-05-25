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

import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.config.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('auth-service');

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppEnv, true>);

  // Préfixe global — santé et JWKS restent à la racine (interop / probes).
  app.setGlobalPrefix('api/v1', {
    exclude: [
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
  logger.log(`JWKS proxy : http://localhost:${port}/.well-known/jwks.json`);
}

void bootstrap();
