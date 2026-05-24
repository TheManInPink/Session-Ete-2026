/**
 * @file        main.ts
 * @description Point d'entrée du microservice enrollment-service (port 3013).
 *
 *              RÔLE — collecte initiale des données d'identité d'un citoyen,
 *              workflow d'enrôlement avec validation agent, intégration RAVEC,
 *              support kits mobiles offline (sync différée).
 *
 *              BLOC : A (Bloc principal NINA Mali)
 *              PROMPT v3.0 référent : 3.8
 *
 * @author      Étudiant UQAR
 * @date        2026-05-23
 * @module      enrollment-service
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AllExceptionsFilter, CorrelationMiddleware, LOGGER_TOKEN } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

import { AppModule } from './app.module.js';

const PORT = Number(process.env.ENROLLMENT_SERVICE_PORT ?? 3013);
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '0.1.0';

/**
 * Démarre le microservice enrollment-service.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    bufferLogs: true,
  });

  // Récupère le logger Pino central via DI
  const logger = app.get<StructuredLogger>(LOGGER_TOKEN);

  // ─── Middleware de corrélation EN PREMIER ─────────────────────────
  app.use((req: unknown, res: unknown, next: unknown) =>
    app.get(CorrelationMiddleware).use(req as never, res as never, next as never),
  );

  // ─── ValidationPipe global ──────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── AllExceptionsFilter global ────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // ─── Préfixe global /api/v1 ────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/(.*)', 'metrics'],
  });

  // ─── Swagger ─────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NINA-AES Enrollment Service')
    .setDescription(
      "Service d'enrôlement initial des citoyens. Génère un NINA selon les " +
        "règles RAVEC, vérifie l'unicité via ai-service, accepte les " +
        'justificatifs scannés (acte de naissance), gère les sync différées ' +
        'depuis les kits mobiles offline. Cf. PROMPT v3.0 §3.8.',
    )
    .setVersion(SERVICE_VERSION)
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'access-token')
    .addTag('enrollment', 'Workflow enrôlement NINA')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'NINA-AES — enrollment-service',
  });

  // ─── Graceful shutdown ─────────────────────────────────────
  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.warn({ signal }, 'Signal reçu — arrêt gracieux');
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen(PORT, '0.0.0.0');
  logger.info(
    { port: PORT, version: SERVICE_VERSION },
    `✅ enrollment-service démarré sur :${PORT}`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error('❌ Bootstrap enrollment-service fail', err);
  process.exit(1);
});
