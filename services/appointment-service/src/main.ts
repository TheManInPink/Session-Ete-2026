/**
 * @file        main.ts
 * @description Point d'entrée du microservice appointment-service (port 3008).
 *              Active Helmet, CORS, ValidationPipe global, Swagger. Le
 *              producteur RabbitMQ démarre via `onModuleInit` ; l'arrêt propre
 *              (AMQP, Redis, Prisma) via `enableShutdownHooks`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service
 */
import { setDefaultResultOrder } from 'node:dns';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

// Certains postes (Windows/macOS) résolvent `localhost` en IPv6 (::1) AVANT
// IPv4, alors que les mappings de ports Docker n'écoutent qu'en IPv4 → les
// drivers Node (pg, ioredis, amqplib) échouent en ECONNRESET. On force la
// résolution IPv4 d'abord : sans effet en production (K3s : ClusterIP IPv4),
// indispensable en dev local. Doit s'exécuter AVANT toute connexion.
setDefaultResultOrder('ipv4first');

async function bootstrap(): Promise<void> {
  const logger = new Logger('appointment-service');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const cfg = app.get(ConfigService<Env, true>);

  app.use(helmet({ contentSecurityPolicy: false }));

  // Préfixe global ; /health* et `/` (page d'accueil) exclus pour matcher la
  // sonde Docker (curl /health) et éviter un 404 à la racine.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready', { path: '/', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const corsOrigins = cfg
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Hooks SIGTERM → onModuleDestroy / onApplicationShutdown (fermeture AMQP/Redis).
  app.enableShutdownHooks();

  const swaggerCfg = new DocumentBuilder()
    .setTitle('NINA-AES — appointment-service')
    .setDescription(
      'Prise de rendez-vous dans les centres d’enrôlement (CTDEC + antennes RAVEC). ' +
        'Créneaux STANDARD/PRIORITAIRE, file d’attente virtuelle Redis, quotas par centre, ' +
        'blacklist no-show, rappels SMS (J-1/H-2) publiés vers notification-service.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('centers', 'Centres d’enrôlement : recherche, détail, disponibilités, suggestion')
    .addTag('appointments', 'Rendez-vous : création, consultation, annulation, check-in, clôture')
    .addTag('health', 'Healthcheck (Postgres + Redis)')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerCfg));

  const port = cfg.get('APPOINTMENT_SERVICE_PORT', { infer: true });
  await app.listen(port);
  logger.log(`appointment-service prêt sur http://localhost:${port}`);
  logger.log(`Swagger UI : http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  new Logger('appointment-service').error(
    'bootstrap failed',
    err instanceof Error ? err.stack : err,
  );
  process.exit(1);
});
