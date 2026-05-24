/**
 * @file        health.controller.ts
 * @description Healthcheck Terminus du gateway.
 *
 *              EXPOSE :
 *              - GET /health         — liveness simple (process up)
 *              - GET /health/ready   — readiness (services aval critiques OK)
 *
 *              POURQUOI 2 endpoints distincts :
 *              - liveness : K8s détecte un process mort → restart
 *              - readiness : K8s ne route plus si dépendances KO → graceful
 *
 * @module      api-gateway/health
 */

import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

/**
 * Liste des services aval considérés CRITIQUES pour la readiness.
 * Si l'un d'eux est KO, le gateway annonce "not ready" et K8s retire le pod
 * du load-balancer.
 */
const CRITICAL_DOWNSTREAMS = [
  { name: 'identity', url: 'http://identity-service:3001/health' },
  { name: 'auth', url: 'http://auth-service:3002/health' },
] as const;

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {}

  /**
   * Liveness : retourne 200 si le process est vivant.
   * Volontairement minimal — n'appelle PAS les services aval pour ne pas
   * provoquer de cascade de panne si un service tousse.
   */
  @Get()
  liveness(): { status: 'ok'; service: 'api-gateway'; timestamp: string } {
    return {
      status: 'ok',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness : vérifie que les services aval critiques répondent.
   * En cas d'échec, Terminus renvoie 503 et K8s suspend le routing.
   *
   * @throws ServiceUnavailableException si au moins un service critique KO.
   */
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check(
      CRITICAL_DOWNSTREAMS.map(
        (svc) => () =>
          this.http.pingCheck(svc.name, svc.url, { timeout: 2000 }).catch((err: unknown) => {
            this.logger.warn({ err, service: svc.name, url: svc.url }, 'Service aval indisponible');
            throw err;
          }),
      ),
    );
  }
}
