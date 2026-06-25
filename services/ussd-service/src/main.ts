/**
 * @file        main.ts
 * @description Point d'entrée du microservice ussd-service (port 3014).
 *
 *              RÔLE — webhook Africa's Talking + machine d'états USSD pour
 *              les téléphones non-smartphones. Pierre angulaire de
 *              l'inclusion numérique : 8 langues nationales, sessions
 *              stateful 5 min via Redis.
 *
 *              BLOC : A (Bloc principal NINA Mali)
 *              PROMPT v3.0 référent : 3.9
 *
 * @author      Étudiant UQAR
 * @date        2026-05-23
 * @module      ussd-service
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { getConfig } from '@nina-aes/config';
import { AllExceptionsFilter, CorrelationMiddleware, LOGGER_TOKEN } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

import { AppModule } from './app.module.js';

const PORT = Number(process.env.USSD_SERVICE_PORT ?? 3014);
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '0.1.0';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
    bufferLogs: true,
  });

  const logger = app.get<StructuredLogger>(LOGGER_TOKEN);

  // ─── trust proxy : durcissement anti-usurpation de l'IP source ──────────────
  // L'IP source est une frontière de sécurité (IP allowlist du webhook). On NE
  // fait confiance aux en-têtes transférés (`X-Forwarded-For` / `X-Real-IP`)
  // QUE pour le nombre EXACT de sauts de proxy déclaré (TRUST_PROXY_HOPS). Sans
  // cela, Express ferait par défaut confiance à AUCUN proxy et `X-Real-IP` resté
  // lisible par le guard pourrait être usurpé par un client direct. On borne au
  // nombre de hops connus plutôt que `true` (qui ferait aveuglément confiance à
  // tout XFF). Cf. AtAuthenticityGuard (couche 1) + doc 14 §4.2.
  const isProduction = process.env.NODE_ENV === 'production';
  const trustProxyHops = getConfig().TRUST_PROXY_HOPS;
  if (isProduction && trustProxyHops < 1) {
    // En prod, l'IP allowlist est inopérante (donc usurpable) sans un proxy de
    // confiance qui RÉÉCRIT `X-Real-IP`. On refuse de démarrer : fail-closed.
    throw new Error(
      'TRUST_PROXY_HOPS doit être >= 1 en production (l’IP allowlist USSD ' +
        'dépend d’un reverse-proxy de confiance qui réécrit X-Real-IP). ' +
        'Sinon X-Real-IP est usurpable et la couche 1 du guard est contournée.',
    );
  }
  // `trust proxy = N` : Express ne fait confiance qu'aux N derniers proxys de la
  // chaîne pour résoudre `req.ip` / `req.ips`. `0` ⇒ aucun proxy de confiance.
  app.set('trust proxy', trustProxyHops);

  // ─── Corrélation EN PREMIER ──────────────────────────────────
  app.use((req: unknown, res: unknown, next: unknown) =>
    app.get(CorrelationMiddleware).use(req as never, res as never, next as never),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // POURQUOI : le webhook Africa's Talking attend une réponse text/plain au
  // chemin /ussd/callback (sans préfixe /api/v1) pour rester compatible avec
  // la config opérateur Orange Mali. On laisse `/api/v1` pour les endpoints
  // de debug (status sessions) mais le callback est exclu.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/(.*)', 'metrics', 'ussd/callback'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NINA-AES USSD Service')
    .setDescription(
      "Webhook Africa's Talking + machine d'états USSD pour téléphones " +
        'basiques. Menu *123*NINA# en 8 langues nationales (FR, BM, SNK, ' +
        'FF, TMQ, HAU, MOS, DJE). Cf. PROMPT v3.0 §3.9.',
    )
    .setVersion(SERVICE_VERSION)
    .addTag('ussd', 'Webhook USSD + sessions')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'NINA-AES — ussd-service',
  });

  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.warn({ signal }, 'Signal reçu — arrêt gracieux');
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen(PORT, '0.0.0.0');
  logger.info({ port: PORT, version: SERVICE_VERSION }, `✅ ussd-service démarré sur :${PORT}`);
}

bootstrap().catch((err: unknown) => {
  console.error('❌ Bootstrap ussd-service fail', err);
  process.exit(1);
});
