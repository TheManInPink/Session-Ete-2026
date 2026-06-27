/**
 * @file        main.ts
 * @description Point d'entrée du microservice interop-service (BCID-AES, port
 *              3006). Active Helmet, CORS, ValidationPipe global, Swagger
 *              (OpenAPI 3.x : securitySchemes mTLS ET JWS). Le corps du verbe
 *              entrant `verify` est un JWS compact brut (Content-Type
 *              application/jose) : on enregistre un parseur texte dédié.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service
 */
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('interop-service');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const cfg = app.get(ConfigService<Env, true>);

  app.use(helmet({ contentSecurityPolicy: false }));

  // Le JWS compact arrive en `application/jose` (ou `application/jws`) : on le
  // reçoit en TEXTE brut. Le parseur JSON par défaut ne couvre pas ce type.
  app.use(express.text({ type: ['application/jose', 'application/jws'], limit: '64kb' }));

  // Préfixe global ; /health* et `/` exclus pour matcher la sonde Docker
  // (curl /health) et éviter un 404 à la racine du service.
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

  // Hooks SIGTERM → onModuleDestroy / onApplicationShutdown (close Redis, Vault).
  app.enableShutdownHooks();

  const swaggerCfg = new DocumentBuilder()
    .setTitle('NINA-AES — interop-service (BCID-AES v1)')
    .setDescription(
      'Interopérabilité transfrontalière Mali ⇄ Burkina ⇄ Niger. Défense en ' +
        'profondeur : mTLS (identité par cert pair, §4.7) ET JWS Ed25519 ' +
        '(signature de payload). Réponses minimalistes (privacy by design).',
    )
    .setVersion('1.0.0')
    .addBearerAuth() // JWT interne (routes admin/sortantes)
    // mTLS ET JWS sont REQUIS ENSEMBLE sur le verbe entrant (pas un OR) : on
    // documente les deux schémas de sécurité (cf. docs/api/bcid-aes-v1.yaml).
    .addSecurity('mTLS', {
      // `mutualTLS` est un type OpenAPI 3.1+ que le typage du DocumentBuilder
      // (union 3.0) ne déclare pas encore ; on le force à l'émission (la spec
      // canonique OpenAPI 3.2 publiable est `docs/api/bcid-aes-v1.yaml`).
      type: 'mutualTLS' as 'http',
      description:
        "Cert client X.509 émis par la CA AES. Handshake terminé par l'ingress " +
        'NGINX, qui injecte le cert pair vérifié (ssl-client-*). Fingerprint ' +
        'confronté à aes_partners. Jamais dérivé d un header client.',
    })
    .addSecurity('JWSSignature', {
      type: 'http',
      scheme: 'jose',
      bearerFormat: 'JWS-Ed25519-compact',
      description:
        'JWS Ed25519 (EdDSA figé) sur le body. Claims protégés exigés : jti ' +
        '(= requestId, anti-replay), iat, nbf, exp (≤ 5 min), iss, aud (= aes:MLI).',
    })
    .addTag('interop', 'Verbe entrant BCID-AES verify-nina (mTLS + JWS)')
    .addTag('interop-admin', 'Routes admin / sortantes (JWT interne + rôle)')
    .addTag('health', 'Healthcheck (Postgres + Redis)')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerCfg));

  const port = cfg.get('INTEROP_SERVICE_PORT', { infer: true });
  await app.listen(port);
  logger.log(`interop-service (BCID-AES) prêt sur http://localhost:${port}`);
  logger.log(`Swagger UI : http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  new Logger('interop-service').error('bootstrap failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
