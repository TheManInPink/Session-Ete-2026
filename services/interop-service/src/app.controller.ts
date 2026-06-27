/**
 * @file        app.controller.ts
 * @description Contrôleur racine (page d'accueil) du microservice interop-service.
 *              Le healthcheck est désormais porté par `HealthController`
 *              (Terminus, Postgres + Redis) ; on évite tout doublon sur /health.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service
 */
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '@nina-aes/auth-guards';

@Controller()
export class AppController {
  /** Racine du service — évite un 404 brut et confirme l'identité du nœud. */
  @Get()
  @Public()
  @ApiExcludeEndpoint()
  root(): { service: 'interop-service'; protocol: 'BCID-AES v1'; timestamp: string } {
    return {
      service: 'interop-service',
      protocol: 'BCID-AES v1',
      timestamp: new Date().toISOString(),
    };
  }
}
