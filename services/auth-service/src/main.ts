/**
 * @file        main.ts
 * @description Point d'entrée du microservice auth-service — Authentification et autorisation
 * @author      Étudiant UQAR
 * @date        2026
 * @module      auth-service
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';

/** Port d'écoute du service */
const PORT = process.env.PORT || 3002;

/**
 * Fonction de démarrage du microservice.
 * Configure les pipes de validation globaux et lance le serveur HTTP.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('auth-service');

  const app = await NestFactory.create(AppModule);

  // Validation automatique des DTOs entrants (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non décorées
      forbidNonWhitelisted: true, // Rejette les propriétés inconnues
      transform: true, // Transforme les payloads en instances de DTO
    }),
  );

  // Préfixe global — santé et JWKS restent à la racine (interop / probes)
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: '.well-known/jwks.json', method: RequestMethod.GET },
    ],
  });

  // Activation de CORS pour le développement
  app.enableCors();

  await app.listen(PORT);
  logger.log(`auth-service démarré sur le port ${PORT}`);
  logger.log(`JWKS proxy: http://localhost:${PORT}/.well-known/jwks.json`);
}

bootstrap();
