/**
 * @file        main.ts
 * @description Point d'entrée du microservice notification-service — Notifications SMS et emails
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/** Port d'écoute du service */
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3005;

/**
 * Fonction de démarrage du microservice.
 * Configure les pipes de validation globaux et lance le serveur HTTP.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('notification-service');

  const app = await NestFactory.create(AppModule);

  // Validation automatique des DTOs entrants (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non décorées
      forbidNonWhitelisted: true, // Rejette les propriétés inconnues
      transform: true, // Transforme les payloads en instances de DTO
    }),
  );

  // Préfixe global API ; /health exclu pour matcher la sonde Docker/K3s (curl /health)
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Activation de CORS pour le développement
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  });

  const config = new DocumentBuilder()
    .setTitle('NINA-AES Notification Service')
    .setDescription('Service de notifications — email, SMS et alertes push')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('email', 'Notifications email')
    .addTag('sms', 'Notifications SMS')
    .addTag('push', 'Notifications push')
    .addTag('health', 'Health check')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(PORT);
  logger.log(`notification-service démarré sur le port ${PORT}`);
  console.log(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
}

bootstrap();
