/**
 * @file        main.ts
 * @description Point d'entrée du microservice api-gateway (port 3000).
 *
 *              RÔLE — point d'entrée HTTP unique pour les 3 apps Next.js
 *              (citizen / admin / governance) + apps/mobile + apps/kiosk +
 *              ussd-service. Toutes les requêtes externes transitent ici avant
 *              d'être routées vers les 14 microservices internes.
 *
 *              ORDRE DE BOOTSTRAP CRITIQUE :
 *              0. (optionnel) Démarrage du SDK OTel AVANT tout le reste
 *              1. Création de l'app Nest
 *              2. Logger structuré (depuis le container DI)
 *              3. Helmet (headers de sécurité)
 *              4. Compression gzip/brotli
 *              5. CORS configurable
 *              6. ValidationPipe + AllExceptionsFilter globaux
 *              7. Préfixe /api/v1 (sauf health & metrics)
 *              8. Swagger /api/docs (+ dépôt de la base pour l'agrégat)
 *              9. Graceful shutdown
 *
 * @author      Étudiant UQAR
 * @date        2026-05-23
 * @module      api-gateway
 */

// ⚠️ OTel doit démarrer AVANT le reste pour instrumenter http/express.
// Opt-in (OTEL_TRACING_ENABLED) pour ne pas peser sur le dev/CI par défaut.
import { startOtelTracing } from '@nina-aes/observability';
if (['1', 'true', 'yes', 'on'].includes((process.env.OTEL_TRACING_ENABLED ?? '').toLowerCase())) {
  startOtelTracing('api-gateway');
}

import helmet from 'helmet';
import compression from 'compression';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AllExceptionsFilter, LOGGER_TOKEN } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

import { AppModule } from './app.module.js';
import { OpenApiBaseHolder } from './modules/aggregator/openapi-base.holder.js';
import { AggregatorService } from './modules/aggregator/aggregator.service.js';

/** Port d'écoute — peut être surchargé par variable d'environnement. */
const PORT = Number(process.env.API_GATEWAY_PORT ?? 3000);

/** Version exposée dans le manifest Swagger et les logs de démarrage. */
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '1.0.0';

/** Petit helper de lecture de flag booléen depuis process.env. */
function flag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? '').toLowerCase());
}

/**
 * Démarre le microservice api-gateway.
 *
 * @throws Process exits with code 1 on bootstrap failure.
 */
async function bootstrap(): Promise<void> {
  // Création de l'app NestJS. On garde le logger natif minimal au boot ; on
  // bascule ensuite sur @nina-aes/logger (LoggerModule.forRoot dans AppModule).
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    bufferLogs: true,
  });

  const logger = app.get<StructuredLogger>(LOGGER_TOKEN);
  app.useLogger({
    log: (msg: unknown) => logger.info({ source: 'nestjs' }, String(msg)),
    error: (msg: unknown, trace?: unknown) =>
      logger.error({ source: 'nestjs', trace }, String(msg)),
    warn: (msg: unknown) => logger.warn({ source: 'nestjs' }, String(msg)),
    debug: (msg: unknown) => logger.debug({ source: 'nestjs' }, String(msg)),
    verbose: (msg: unknown) => logger.trace({ source: 'nestjs' }, String(msg)),
  });

  // ─── Helmet — headers de sécurité (CSP, HSTS, X-Frame-Options, etc.) ─
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false, // permet Swagger UI
    }),
  );

  // ─── Compression gzip/brotli ────────────────────────────────────────
  // Réduit la bande passante vers les apps front (réponses JSON volumineuses :
  // listes de centres, specs OpenAPI agrégées). Important pour les connexions
  // à faible débit (zones rurales AES).
  app.use(compression());

  // ─── CORS — origines des 3 apps Next.js + mobile + kiosk ────────────
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
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
  });

  // ─── ValidationPipe global ──────────────────────────────────────────
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
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)', 'metrics'] });

  // ─── Swagger OpenAPI 3.1 (base native du gateway) ───────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NINA-AES API Gateway')
    .setDescription(
      "Point d'entrée HTTP unifié pour la plateforme NINA-AES. Route les requêtes " +
        'vers les 14 microservices internes. La spec OpenAPI AGRÉGÉE de toute la ' +
        'plateforme est disponible sur GET /api/v1/api-gateway/openapi.json.',
    )
    .setVersion(SERVICE_VERSION)
    .addServer(`http://localhost:${PORT}`, 'Local dev')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const baseDocument = SwaggerModule.createDocument(app, swaggerConfig);

  // Dépose la base native pour que l'agrégateur la fonde (gateway-meta).
  app.get(OpenApiBaseHolder).set(baseDocument);

  // Choix du document servi sur /api/docs : agrégé au boot (si activé) ou natif.
  let uiDocument = baseDocument;
  if (flag('SWAGGER_AGGREGATE_ON_BOOT')) {
    logger.info('Construction de la spec OpenAPI agrégée au boot…');
    uiDocument = await app.get(AggregatorService).getAggregated(baseDocument, true);
  }
  SwaggerModule.setup('api/docs', app, uiDocument, {
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
  logger.info({ url: `http://localhost:${PORT}/api/docs` }, '📚 Swagger (natif)');
  logger.info(
    { url: `http://localhost:${PORT}/api/v1/api-gateway/openapi.json` },
    '📚 OpenAPI agrégé',
  );
  logger.info({ url: `http://localhost:${PORT}/health` }, '💚 Health');
  logger.info({ url: `http://localhost:${PORT}/metrics` }, '📊 Metrics');
}

bootstrap().catch((err: unknown) => {
  // À ce stade, le logger structuré n'est peut-être pas encore disponible.
  console.error('❌ Bootstrap api-gateway fail', err);
  process.exit(1);
});
