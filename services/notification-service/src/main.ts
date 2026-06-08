/**
 * @file        main.ts
 * @description Point d'entrée du microservice notification-service (port 3005).
 *              Active Helmet, CORS, ValidationPipe global, Swagger. Le
 *              producteur/consommateur RabbitMQ démarre via les hooks
 *              `onModuleInit` ; l'arrêt propre via `enableShutdownHooks`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service
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
// drivers Node (pg, amqplib, nodemailer) échouent en ECONNRESET (Postgres
// "down", RabbitMQ injoignable). On force la résolution IPv4 d'abord : sans
// effet en production (K3s : noms de service / ClusterIP IPv4), indispensable
// en dev local. Doit s'exécuter AVANT toute connexion.
setDefaultResultOrder('ipv4first');

async function bootstrap(): Promise<void> {
  const logger = new Logger('notification-service');
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

  // Hooks SIGTERM → onModuleDestroy / onApplicationShutdown (fermeture AMQP).
  app.enableShutdownHooks();

  const swaggerCfg = new DocumentBuilder()
    .setTitle('NINA-AES — notification-service')
    .setDescription(
      "Notifications multicanal (SMS via Africa's Talking, email SMTP, push FCM). " +
        'Consumer RabbitMQ avec ré-essai exponentiel + DLQ, idempotence, templates 8 langues.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('notifications', 'Envoi, broadcast, statut, templates, métriques, webhook DLR')
    .addTag('health', 'Healthcheck (Postgres)')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerCfg));

  const port = cfg.get('NOTIFICATION_SERVICE_PORT', { infer: true });
  await app.listen(port);
  logger.log(`notification-service prêt sur http://localhost:${port}`);
  logger.log(`Swagger UI : http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  new Logger('notification-service').error(
    'bootstrap failed',
    err instanceof Error ? err.stack : err,
  );
  process.exit(1);
});
