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

import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  /**
   * Page d'accueil minimale — info service + liens utiles.
   * Routée sur /api/v1/ (préfixe global).
   *
   * 🔒 Défense en profondeur : `@Public()` explicite l'intention « aucune donnée
   * personnelle ici ». Inoffensif aujourd'hui (aucun APP_GUARD global), mais si
   * un guard global est introduit plus tard, cette route reste accessible sans
   * exiger un token (et sans devenir une fuite : elle n'expose que des métadonnées).
   *
   * @returns Objet info service avec liens vers docs, health et metrics
   */
  @Get()
  @Public()
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
