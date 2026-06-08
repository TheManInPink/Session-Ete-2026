/**
 * @file        app.controller.ts
 * @description Contrôleur racine — page d'accueil JSON sur `/` (exclu du préfixe
 *              api/v1, cf. main.ts) pour éviter un 404 à la racine. La santé est
 *              servie par HealthController (modules/health), pas ici.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service
 */
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  /** Page d'accueil minimale — info service + liens utiles. */
  @Get()
  @ApiExcludeEndpoint()
  root(): { service: string; version: string; docs: string; health: string } {
    return {
      service: 'notification-service',
      version: process.env.SERVICE_VERSION ?? '0.1.0',
      docs: '/api/docs',
      health: '/health',
    };
  }
}
