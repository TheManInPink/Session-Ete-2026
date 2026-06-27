/**
 * @file        main.ts
 * @description Bootstrap du microservice document-service (port 3004).
 *              Active Helmet, CORS, Swagger, ValidationPipe, logger NestJS.
 * @module      document-service
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const logger = new Logger('document-service');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  const cfg = app.get(ConfigService<Env, true>);
  const port = cfg.get('PORT', { infer: true });
  const corsOrigins = cfg.get('CORS_ORIGINS', { infer: true })!.split(',');

  // ── IP réelle derrière l'api-gateway / reverse-proxy ───────────────────
  // `trust proxy` fait résoudre `req.ip` depuis `X-Forwarded-For` (au lieu de
  // l'IP du proxy). Indispensable pour journaliser l'IP réelle des accès
  // download / verify-qr (cf. DocumentAccessLog). Le réseau interne est de
  // confiance (mTLS Linkerd ⏳ infra) — on fait donc confiance au 1er hop.
  app.set('trust proxy', 1);

  // ── DURCISSEMENT P1 — CSP STRICTE PAR DÉFAUT + HSTS ────────────────────
  // ANCIEN défaut dangereux : `helmet({ contentSecurityPolicy: false })`
  // désactivait la CSP sur TOUTE l'application pour faire plaisir à Swagger.
  // NOUVEAU : CSP stricte globale + HSTS. On ne relâche la CSP QUE sur la
  // route Swagger (`/api/docs`), via un helmet dédié monté AVANT le helmet
  // strict (l'ordre compte : la route Swagger doit matcher en premier).
  const swaggerHelmet = helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  });
  const strictHelmet = helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'], // QR rendu en data:image/png — autorisé
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    // HSTS : 2 ans, sous-domaines inclus, éligible preload.
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
  });
  // L'ordre + l'exclusion comptent : `swaggerHelmet` couvre les routes Swagger,
  // et `strictHelmet` couvre TOUT LE RESTE. On NE doit PAS ré-appliquer le
  // helmet strict sur `/api/docs*` (Express = last-write-wins : il écraserait la
  // CSP assouplie et casserait swagger-ui). On court-circuite donc explicitement.
  const SWAGGER_PATHS = ['/api/docs', '/api/docs-json'];
  app.use(SWAGGER_PATHS, swaggerHelmet);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (SWAGGER_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
      next();
      return;
    }
    strictHelmet(req, res, next);
  });

  // Préfixe global API ; /health* exclu (sonde Docker curl /health) et `/` (page d'accueil)
  // exclu du préfixe pour répondre à la racine du service au lieu d'un 404.
  // `metrics` exclu également : réservé au réseau d'observabilité (Prometheus),
  // jamais exposé publiquement (aucun MetricsController n'est monté à ce jour —
  // l'exclusion garde l'invariant si un scrape interne est ajouté). ⏳ mTLS de
  // scraping = infra (Linkerd / cert client Prometheus).
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'health',
      'health/live',
      'health/ready',
      'metrics',
      { path: '/', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: corsOrigins, credentials: true });

  const swaggerCfg = new DocumentBuilder()
    .setTitle('NINA-AES — document-service')
    .setDescription(
      'Fiche Descriptive Individuelle (FDI) : PDF officiel CTDEC, ' +
        'QR JWT RS256 signé via Vault Transit, stockage MinIO WORM 10 ans.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('documents', 'Génération + révocation FDI (auth requise)')
    .addTag('public-documents', 'Vérification QR offline-friendly (sans auth)')
    .addTag('health', 'Healthcheck (MinIO + Vault + Postgres)')
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerCfg);
  SwaggerModule.setup('api/docs', app, swaggerDoc);

  await app.listen(port);
  logger.log(`document-service ready on http://localhost:${port}`);
  logger.log(`Swagger UI:        http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  new Logger('document-service').error('bootstrap failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
