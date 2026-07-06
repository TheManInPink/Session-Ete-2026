/**
 * @file        main.ts
 * @description Point d'entrée du governance-service (Bloc C2/C3, port 3010).
 *              Active Helmet (CSP/HSTS), CORS restreint, ValidationPipe global
 *              (whitelist + forbidNonWhitelisted), Swagger. L'audit RabbitMQ
 *              démarre via `onModuleInit` ; l'arrêt propre (AMQP, Vault, Prisma)
 *              via `enableShutdownHooks`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service
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

// Force la résolution IPv4 d'abord (mappings de ports Docker IPv4 uniquement).
setDefaultResultOrder('ipv4first');

async function bootstrap(): Promise<void> {
  const logger = new Logger('governance-service');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const cfg = app.get(ConfigService<Env, true>);

  // Helmet : en-têtes de sécurité (CSP, HSTS, noSniff, frameguard…). CSP stricte
  // (le service ne sert pas de HTML applicatif) ; HSTS actif (derrière ingress TLS).
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

  // Limite EXPLICITE de taille du corps (anti-amplification mémoire).
  const bodyLimit = cfg.get('HTTP_BODY_LIMIT_BYTES', { infer: true });
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  // Préfixe global ; /health* et `/` exclus (sonde Docker + racine).
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

  // Hooks SIGTERM → onModuleDestroy / onApplicationShutdown (AMQP, Vault).
  app.enableShutdownHooks();

  const swaggerCfg = new DocumentBuilder()
    .setTitle('NINA-AES — governance-service')
    .setDescription(
      'Gouvernance institutionnelle (Bloc C2/C3). SGOGT : messagerie officielle ' +
        'SIGNÉE (JWS RS256 via Vault Transit, non-répudiation) + escalade automatique + ' +
        'hash-chain SHA-256. Directives Kanban auditées. Intégrité électorale : ' +
        'pseudonymisation HMAC Vault (clé non exportable) + export delta DGE signé, ' +
        'rate-limité, quota par compte, et journalisé. Le NINA n’apparaît jamais en clair.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('sgogt', 'Messagerie officielle signée (non-répudiation + escalade)')
    .addTag('directives', 'Directives Kanban auditées')
    .addTag('elections', 'Intégrité électorale (export delta DGE sécurisé)')
    .addTag('health', 'Healthcheck (Postgres)')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerCfg));

  const port = cfg.get('GOVERNANCE_SERVICE_PORT', { infer: true });
  await app.listen(port);
  logger.log(`governance-service prêt sur http://localhost:${port}`);
  logger.log(`Swagger UI : http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  new Logger('governance-service').error(
    'bootstrap failed',
    err instanceof Error ? err.stack : err,
  );
  process.exit(1);
});
