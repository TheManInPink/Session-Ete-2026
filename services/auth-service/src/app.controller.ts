/**
 * @file        app.controller.ts
 * @description Contrôleur racine du microservice auth-service — page d'accueil
 *              (/) + endpoint de santé (/health). Les deux sont exclus du
 *              préfixe api/v1 (cf. main.ts).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      auth-service
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '@nina-aes/auth-guards';

@Controller()
export class AppController {
  /** Page d'accueil — info service + liens utiles (routée sur /, hors préfixe). */
  @Public()
  @Get()
  root(): { service: string; version: string; docs: string; health: string } {
    return {
      service: 'auth-service',
      version: process.env.SERVICE_VERSION ?? '0.1.0',
      docs: '/api/docs',
      health: '/health',
    };
  }

  /**
   * Endpoint de santé — permet à Docker/K3s de vérifier que le service est vivant.
   * @returns Objet avec le statut, le nom du service et le timestamp
   */
  @Public()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
    };
  }
}
