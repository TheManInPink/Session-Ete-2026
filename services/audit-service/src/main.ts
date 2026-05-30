/**
 * @file        main.ts
 * @description Point d'entrée du microservice audit-service (port 3007).
 *              Active Helmet, CORS, ValidationPipe global, Swagger. La
 *              consommation RabbitMQ démarre via `AuditConsumer.onModuleInit`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service
 */
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('audit-service');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const cfg = app.get(ConfigService<Env, true>);

  app.use(helmet({ contentSecurityPolicy: false }));

  // Préfixe global ; /health* et `/` (page d'accueil) exclus pour matcher la
  // sonde Docker (curl /health) et éviter un 404 à la racine du service.
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

  // Hooks SIGTERM → onModuleDestroy / onApplicationShutdown (flush batch, close AMQP).
  app.enableShutdownHooks();

  const swaggerCfg = new DocumentBuilder()
    .setTitle('NINA-AES — audit-service')
    .setDescription(
      "Journal d'audit immuable (append-only) : chaîne Merkle SHA-256 + " +
        'scellement de racine Ed25519. API de preuve cryptographique pour auditeurs.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('audit', "Preuve & consultation du journal d'audit")
    .addTag('health', 'Healthcheck (Postgres)')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerCfg));

  const port = cfg.get('AUDIT_SERVICE_PORT', { infer: true });
  await app.listen(port);
  logger.log(`audit-service prêt sur http://localhost:${port}`);
  logger.log(`Swagger UI : http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  new Logger('audit-service').error('bootstrap failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
