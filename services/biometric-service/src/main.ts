/**
 * @file        main.ts
 * @description Point d'entrée du biometric-service (Bloc F, port 3012 — le module
 *              le plus sensible). Active Helmet (CSP/HSTS), CORS restreint,
 *              ValidationPipe global (whitelist + forbidNonWhitelisted), Swagger.
 *              Le publisher d'audit RabbitMQ démarre via `onModuleInit` ; l'arrêt
 *              propre (AMQP, Prisma) via `enableShutdownHooks`.
 *
 *              ⚠️  Le GATE DPIA (DpiaGateService) s'évalue au boot via
 *              `onModuleInit` : en production sans DPIA signée, le démarrage est
 *              INTERROMPU (fail-fast) avant même l'écoute HTTP.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service
 */
import { setDefaultResultOrder } from 'node:dns';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

// Force la résolution IPv4 d'abord (mappings de ports Docker IPv4 uniquement) :
// sans effet en production (K3s ClusterIP IPv4), indispensable en dev local.
setDefaultResultOrder('ipv4first');

async function bootstrap(): Promise<void> {
  const logger = new Logger('biometric-service');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const cfg = app.get(ConfigService<Env, true>);

  // Helmet : en-têtes de sécurité (CSP, HSTS, noSniff, frameguard…). On garde la
  // CSP par défaut de Helmet (le service ne sert pas de HTML applicatif) ; HSTS
  // est actif par défaut (max-age 180 j) — pertinent derrière l'ingress TLS.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] },
      },
      hsts: { maxAge: 15_552_000, includeSubDomains: true },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Limite EXPLICITE de taille du corps (anti-amplification mémoire) : une capture
  // biométrique encodée (vecteur ISO + consentement JWS) ne dépasse pas quelques
  // centaines de Ko. Un corps trop gros est rejeté en 413 par le body-parser.
  const bodyLimit = cfg.get('HTTP_BODY_LIMIT_BYTES', { infer: true });
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  // Préfixe global ; /health* et `/` exclus pour matcher la sonde Docker
  // (curl /health) et éviter un 404 à la racine.
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
    .setTitle('NINA-AES — biometric-service')
    .setDescription(
      'Biométrie (Bloc F). Protection de template ISO/IEC 24745 (cancelable biometrics, ' +
        'distance-préservante) : on ne stocke JAMAIS l’image brute ni le template en clair, ' +
        'uniquement un template PROTÉGÉ comparé par DISTANCE + seuil τ (jamais par égalité). ' +
        'Consentement JWS Ed25519 ANCRÉ sur la clé publique citoyen ; vérification 1:1 ' +
        '(boucle sans court-circuit, anti-bruteforce) ; identification 1:N restreinte ' +
        '(INSPECTOR + 4-yeux). Gate DPIA/RGPD bloquant en production.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('consent', 'Consentement biométrique (JWS Ed25519 ancré, révocable)')
    .addTag('enrollment', 'Enrôlement (template protégé cancelable, jamais d’image)')
    .addTag('verify', 'Vérification 1:1 (distance ≤ τ) + identification 1:N restreinte')
    .addTag('health', 'Healthcheck (Postgres)')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerCfg));

  const port = cfg.get('BIOMETRIC_SERVICE_PORT', { infer: true });
  await app.listen(port);
  logger.log(`biometric-service prêt sur http://localhost:${port}`);
  logger.log(`Swagger UI : http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  new Logger('biometric-service').error('bootstrap failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
