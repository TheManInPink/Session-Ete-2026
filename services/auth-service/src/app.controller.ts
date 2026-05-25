/**
 * @file        app.controller.ts
 * @description Contrôleur de santé du microservice auth-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      auth-service
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '@nina-aes/auth-guards';

@Controller()
export class AppController {
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
