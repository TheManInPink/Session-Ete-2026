/**
 * @file        app.controller.ts
 * @description Contrôleur de santé du microservice audit-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service
 */

import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  /**
   * Endpoint de santé — permet à Docker/K3s de vérifier que le service est vivant.
   * @returns Objet avec le statut, le nom du service et le timestamp
   */
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'audit-service',
      timestamp: new Date().toISOString(),
    };
  }
}
