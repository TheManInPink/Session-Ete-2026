/**
 * @file        main.ts
 * @description Point d'entrée du microservice api-gateway (port 3000).
 *
 *              RÔLE — point d'entrée HTTP unique pour les 3 apps Next.js
 *              (citizen / admin / governance) + apps/mobile + apps/kiosk +
 *              ussd-service. Toutes les requêtes externes transitent ici
 *              avant d'être routées vers les 14 microservices internes.
 *
 *              ORDRE DE BOOTSTRAP CRITIQUE :
 *              1. Création de l'app Nest (sans logger NestJS par défaut)
 *              2. Middleware de corrélation EN PREMIER (X-Request-Id)
 *              3. Helmet pour les headers de sécurité
 *              4. CORS configurable
 *              5. ValidationPipe global
 *              6. AllExceptionsFilter global (logs structurés + format normalisé)
 *              7. Swagger /api/docs
 *              8. Graceful shutdown
 *
 * @author      Étudiant UQAR
 * @date        2026-05-23
 * @module      api-gateway
 */

import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AllExceptionsFilter, CorrelationMiddleware, LOGGER_TOKEN } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

import { AppModule } from './app.module.js';

/** Port d'écoute — peut être surchargé par variable d'environnement. */
const PORT = Number(process.env.API_GATEWAY_PORT ?? 3000);

/** Version exposée dans le manifest Swagger et les logs de démarrage. */
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '1.0.0';

/**
 * Démarre le microservice api-gateway.
 *
 * @throws Process exits with code 1 on bootstrap failure.
 */
async function bootstrap(): Promise<void> {
  // Création de l'app NestJS. On désactive le logger natif Nest car on utilise
  // @nina-aes/logger via LoggerModule.forRoot dans AppModule.
  const app = await NestFactory.create(AppModule, {
    // logger: false désactive le logger NestJS au boot ; on récupère ensuite
    // notre StructuredLogger depuis le container DI.
    logger: ['error', 'warn'],
    bufferLogs: true,
  });

  // Récupère le logger structuré depuis le container DI une fois initialisé.
  // POURQUOI ICI et pas plus tôt : LoggerModule.forRoot doit avoir terminé.
  const logger = app.get<StructuredLogger>(LOGGER_TOKEN);
  app.useLogger({
    log: (msg: unknown) => logger.info({ source: 'nestjs' }, String(msg)),
    error: (msg: unknown, trace?: unknown) =>
      logger.error({ source: 'nestjs', trace }, String(msg)),
    warn: (msg: unknown) => logger.warn({ source: 'nestjs' }, String(msg)),
    debug: (msg: unknown) => logger.debug({ source: 'nestjs' }, String(msg)),
    verbose: (msg: unknown) => logger.trace({ source: 'nestjs' }, String(msg)),
  });

  // ─── Middleware de corrélation (X-Request-Id) — DOIT être en PREMIER ──
  // Sans lui, tous les logs émis pendant le traitement de la requête sont
  // orphelins et impossibles à corréler entre services.
  app.use((req: unknown, res: unknown, next: unknown) =>
    app.get(CorrelationMiddleware).use(req as never, res as never, next as never),
  );

  // ─── Helmet — headers de sécurité (CSP, HSTS, X-Frame-Options, etc.) ─
  // Configuration stricte par défaut. Ajuster contentSecurityPolicy pour
  // /api/docs si Swagger UI échoue à charger en production.
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false, // permet Swagger UI
    }),
  );

  // ─── CORS — origines des 3 apps Next.js + mobile + kiosk ────────────
  // En production, JAMAIS de wildcard. Liste explicite via env.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) ?? [
    'http://localhost:4001', // citizen
    'http://localhost:4002', // admin
    'http://localhost:4003', // governance
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-User-Context'],
    exposedHeaders: ['X-Request-Id'],
  });

  // ─── ValidationPipe global ────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Filter global : exceptions → ErrorResponse normalisée ─────────
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // ─── Préfixe global /api/v1 (sauf /health et /metrics) ──────────────
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/(.*)', 'metrics'],
  });

  // ─── Swagger OpenAPI 3.1 ─────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NINA-AES API Gateway')
    .setDescription(
      "Point d'entrée HTTP unifié pour la plateforme NINA-AES. " +
        'Route les requêtes vers les 14 microservices internes (identity, auth, ai, ' +
        'document, audit, notification, interop, appointment, anticorruption, ' +
        'governance, vulnerability, enrollment, ussd, biometric). ' +
        'Cf. docs/PROMPT-MAITRE-v3.md §Phase 3.1.',
    )
    .setVersion(SERVICE_VERSION)
    .addServer(`http://localhost:${PORT}`, 'Local dev')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    customSiteTitle: 'NINA-AES — api-gateway',
  });

  // ─── Graceful shutdown ───────────────────────────────────────────
  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.warn({ signal }, 'Signal reçu — arrêt gracieux');
      void app.close().then(() => {
        logger.info('Arrêt terminé');
        process.exit(0);
      });
    });
  }

  await app.listen(PORT, '0.0.0.0');

  logger.info(
    { port: PORT, version: SERVICE_VERSION, corsOrigins },
    `✅ api-gateway démarré sur :${PORT}`,
  );
  logger.info({ url: `http://localhost:${PORT}/api/docs` }, '📚 Swagger');
  logger.info({ url: `http://localhost:${PORT}/health` }, '💚 Health');
}

bootstrap().catch((err: unknown) => {
  // À ce stade, le logger structuré n'est peut-être pas encore disponible.
  // On utilise console.error en dernier recours pour ne PAS perdre l'erreur.

  console.error('❌ Bootstrap api-gateway fail', err);
  process.exit(1);
});
