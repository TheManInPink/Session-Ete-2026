/**
 * @file        main.ts
 * @description Point d'entrée du microservice identity-service (port 3001).
 *
 *              Bootstrap NINA-AES standard :
 *                1. OpenTelemetry tracing AVANT NestFactory.create (cf. ADR-017)
 *                2. Nest app + globalPrefix /api/v1
 *                3. ValidationPipe global (whitelist + transform)
 *                4. Filtre d'exception global (logs structurés)
 *                5. Interceptor de logging requêtes
 *                6. Swagger OpenAPI sur /api/docs
 *                7. CORS configurable via env
 *                8. Graceful shutdown sur SIGTERM/SIGINT
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      identity-service
 */

// ⚠️ CRITIQUE : `startOtelTracing` doit s'exécuter AVANT tout import
// applicatif (NestFactory, modules) sinon les auto-instrumentations
// HTTP/Prisma/ioredis ne s'attachent pas.
import { startOtelTracing } from '@nina-aes/observability';
startOtelTracing('identity-service');

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

const PORT = Number(process.env.IDENTITY_SERVICE_PORT ?? 3001);
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '0.1.0';

/**
 * Démarre le microservice et configure tous les middlewares globaux.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('identity-service');

  const app = await NestFactory.create(AppModule, {
    // Logger Nest minimal — le vrai logger applicatif est Pino via @nina-aes/observability
    logger: ['error', 'warn', 'log'],
  });

  // ─── Pipes : validation Zod-like des DTOs class-validator ────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non décorées
      forbidNonWhitelisted: true, // Rejette les propriétés inconnues
      transform: true, // Transforme les payloads en instances de DTO
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Filter : capture toutes les exceptions et structure la réponse ──
  app.useGlobalFilters(new AllExceptionsFilter());

  // ─── Interceptor : log structuré de chaque requête + métriques ──
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ─── Préfixe global /api/v1 ──────────────────────────────────────
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)', 'metrics'] });

  // ─── CORS (apps Next.js) ─────────────────────────────────────────
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? [
      'http://localhost:4001',
      'http://localhost:4002',
      'http://localhost:4003',
    ],
    credentials: true,
  });

  // ─── Swagger OpenAPI 3.1 ─────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NINA-AES Identity Service')
    .setDescription(
      'API du microservice central de gestion des identités NINA pour ' +
        'la plateforme AES (Mali, Burkina Faso, Niger). Cf. doc 07 + ADR-003/012.',
    )
    .setVersion(SERVICE_VERSION)
    .setLicense('UNLICENSED — CTDEC interne', 'https://ctdec.gouv.ml')
    .addServer(`http://localhost:${PORT}`, 'Local dev')
    .addServer('https://staging.nina-aes.uqar.ca', 'Staging')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        description: 'JWT RS256 émis par auth-service (cf. doc 08)',
      },
      'access-token',
    )
    .addTag('citizens', 'CRUD enregistrements NINA + recherche fuzzy')
    .addTag('corrections', 'Workflow correction NINA (citoyen → IA → SIGAC → agent)')
    .addTag('locations', 'Référentiel géographique Mali (20 régions / 159 cercles / etc.)')
    .addTag('health', 'Liveness + readiness + dépendances')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'NINA-AES — identity-service',
  });

  // ─── Graceful shutdown (K8s SIGTERM, doc 20 §4.3) ────────────────
  app.enableShutdownHooks();
  const shutdownSignals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of shutdownSignals) {
    process.on(signal, () => {
      logger.warn(`Signal ${signal} reçu — arrêt gracieux en cours...`);
      void app.close().then(() => {
        logger.log('Arrêt terminé.');
        process.exit(0);
      });
    });
  }

  // ─── Démarrage HTTP ──────────────────────────────────────────────
  await app.listen(PORT, '0.0.0.0');

  logger.log(`✅ identity-service démarré sur :${PORT}`);
  logger.log(`📚 Swagger : http://localhost:${PORT}/api/docs`);
  logger.log(`💚 Health  : http://localhost:${PORT}/health`);
  logger.log(`📊 Metrics : http://localhost:${PORT}/metrics`);
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap fail', err);
  process.exit(1);
});
