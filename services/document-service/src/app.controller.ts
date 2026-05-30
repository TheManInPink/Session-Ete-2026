/**
 * @file        app.controller.ts
 * @description Contrôleur racine — page d'accueil de l'API (info service + liens).
 *              Routé sur `/` (exclu du préfixe api/v1, cf. main.ts) pour éviter un
 *              404 à la racine du service. La santé est servie par HealthController
 *              (modules/health) sur /health, pas ici.
 * @module      document-service
 */

import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  /** Page d'accueil minimale — info service + liens utiles (docs, santé). */
  @Get()
  @ApiExcludeEndpoint()
  root(): { service: string; version: string; docs: string; health: string } {
    return {
      service: 'document-service',
      version: process.env.SERVICE_VERSION ?? '0.1.0',
      docs: '/api/docs',
      health: '/health',
    };
  }
}
