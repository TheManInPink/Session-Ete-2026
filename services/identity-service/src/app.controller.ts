/**
 * @file        app.controller.ts
 * @description Contrôleur racine — page d'accueil de l'API.
 *              Le vrai /health est dans modules/health/health.controller.ts
 *              (avec Terminus + DB + Redis + RabbitMQ + ai-service).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      identity-service
 */

import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller()
export class AppController {
  /**
   * Page d'accueil minimale — info service + liens utiles.
   * Routée sur /api/v1/ (préfixe global).
   *
   * @returns Objet info service avec liens vers docs, health et metrics
   */
  @Get()
  @ApiExcludeEndpoint()
  root(): {
    service: string;
    version: string;
    docs: string;
    health: string;
    metrics: string;
  } {
    return {
      service: 'identity-service',
      version: process.env.SERVICE_VERSION ?? '0.1.0',
      docs: '/api/docs',
      health: '/health',
      metrics: '/metrics',
    };
  }
}
