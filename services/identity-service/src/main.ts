/**
 * @file        main.ts
 * @description Point d'entrée du microservice identity-service — Gestion des enregistrements NINA
 * @author      Étudiant UQAR
 * @date        2026
 * @module      identity-service
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/** Port d'écoute du service */
const PORT = process.env.IDENTITY_SERVICE_PORT || 3001;

/**
 * Fonction de démarrage du microservice.
 * Configure les pipes de validation globaux et lance le serveur HTTP.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('identity-service');

  const app = await NestFactory.create(AppModule);

  // Validation automatique des DTOs entrants (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non décorées
      forbidNonWhitelisted: true, // Rejette les propriétés inconnues
      transform: true, // Transforme les payloads en instances de DTO
    }),
  );

  // Préfixe global pour toutes les routes de ce service
  app.setGlobalPrefix('api/v1');

  // Activation de CORS pour le développement
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  });

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('NINA Identity Service')
    .setDescription('API de gestion des identités NINA pour l\'AES')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('citizens', 'Gestion des citoyens et NINA')
    .addTag('corrections', 'Demandes de correction')
    .addTag('locations', 'Référentiel géographique')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(PORT);
  logger.log(`identity-service démarré sur le port ${PORT}`);
  console.log(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
}

bootstrap();
