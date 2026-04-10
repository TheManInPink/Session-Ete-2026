/**
 * @file        main.ts
 * @description Point d'entrée du microservice audit-service — Journal d'audit immuable Merkle
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/** Port d'écoute du service */
const PORT = process.env.PORT || 3007;

/**
 * Fonction de démarrage du microservice.
 * Configure les pipes de validation globaux et lance le serveur HTTP.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('audit-service');

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
  app.enableCors();

  await app.listen(PORT);
  logger.log(`audit-service démarré sur le port ${PORT}`);
}

bootstrap();
