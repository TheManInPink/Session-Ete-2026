/**
 * @file        main.ts
 * @description Bootstrap du microservice document-service (port 3004).
 *              Active Helmet, CORS, Swagger, ValidationPipe, logger NestJS.
 * @module      document-service
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const logger = new Logger('document-service');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const cfg = app.get(ConfigService<Env, true>);
  const port = cfg.get('PORT', { infer: true });
  const corsOrigins = cfg.get('CORS_ORIGINS', { infer: true })!.split(',');

  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger nécessite inline styles/scripts en dev
    }),
  );
  // Préfixe global API ; /health* exclu pour matcher la sonde Docker/K3s (curl /health)
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/live', 'health/ready'] });
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
