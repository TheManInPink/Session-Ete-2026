/**
 * @file        health.controller.ts
 * @description Healthchecks du gateway.
 *
 *              EXPOSE :
 *              - GET /health             — liveness simple (process up)
 *              - GET /health/ready       — readiness (services CRITIQUES + Redis)
 *              - GET /health/downstreams — agrégateur NON bloquant : état des 14
 *                                          services aval (toujours 200)
 *
 *              POURQUOI distinguer readiness et agrégateur :
 *              - readiness GATE le routing K8s : il ne dépend QUE des services
 *                vraiment critiques (identity, auth) + Redis. Le gateway reste
 *                « ready » même si un service secondaire est KO — c'est le
 *                circuit breaker par route qui isole la panne, pas la readiness.
 *              - l'agrégateur est purement OBSERVATIONNEL (dashboard / debug) :
 *                il liste TOUS les avals sans jamais faire échouer l'endpoint.
 *
 *              NOTE Terminus 11 (ADR mémoire) : `http.pingCheck` ne `throw` PAS
 *              sur erreur réseau, il renvoie `{ status: 'down' }`. C'est
 *              `health.check()` qui agrège et lève 503 si un indicateur est down.
 *
 * @module      api-gateway/health
 */

import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { distinctDownstreams } from '../proxy/proxy.routes.js';

/** Services dont l'indisponibilité doit retirer le gateway du load-balancer. */
const CRITICAL_SERVICES = ['identity', 'auth'] as const;

/** État d'un service aval dans l'agrégateur observationnel. */
interface DownstreamHealth {
  service: string;
  status: 'up' | 'down';
  latencyMs: number | null;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly redis: RedisService,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {}

  /**
   * Liveness : 200 si le process est vivant. Volontairement minimal — n'appelle
   * AUCUN service aval (sinon une panne aval provoquerait des restarts en boucle).
   */
  @Get()
  @ApiOperation({ summary: 'Liveness — le process gateway est vivant' })
  liveness(): { status: 'ok'; service: 'api-gateway'; timestamp: string } {
    return { status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness : vérifie les services CRITIQUES + Redis. 503 si l'un est down.
   *
   * @throws ServiceUnavailableException (503) via Terminus si un indicateur down.
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — services critiques + Redis OK' })
  readiness() {
    const downstreams = distinctDownstreams().filter((d) =>
      CRITICAL_SERVICES.includes(d.serviceName as (typeof CRITICAL_SERVICES)[number]),
    );
    return this.health.check([
      ...downstreams.map(
        (svc) => () =>
          this.http.pingCheck(svc.serviceName, `${svc.targetBaseUrl}/health`, { timeout: 2000 }),
      ),
      () => this.redisIndicator(),
    ]);
  }

  /** Indicateur Redis maison (up/down sans throw — agrégé par health.check). */
  private async redisIndicator(): Promise<HealthIndicatorResult> {
    const up = await this.redis.ping();
    return { redis: { status: up ? 'up' : 'down' } };
  }

  /**
   * Agrégateur NON bloquant : pingue les 14 services aval en parallèle et
   * renvoie leur état. Toujours 200 — c'est un endpoint d'observation, pas un
   * gate. Le champ `degraded` signale qu'au moins un aval est down.
   */
  @Get('downstreams')
  @ApiOperation({ summary: 'Agrégateur — état des 14 services aval (toujours 200)' })
  async downstreams(): Promise<{
    status: 'ok' | 'degraded';
    checkedAt: string;
    services: DownstreamHealth[];
  }> {
    const targets = distinctDownstreams();
    const services = await Promise.all(
      targets.map(({ serviceName, targetBaseUrl }) =>
        this.pingDownstream(serviceName, `${targetBaseUrl}/health`),
      ),
    );
    const degraded = services.some((s) => s.status === 'down');
    if (degraded) {
      this.logger.warn(
        { down: services.filter((s) => s.status === 'down').map((s) => s.service) },
        'Agrégateur health : au moins un service aval est down',
      );
    }
    return { status: degraded ? 'degraded' : 'ok', checkedAt: new Date().toISOString(), services };
  }

  /** Ping best-effort d'un `/health` aval avec timeout (jamais d'exception). */
  private async pingDownstream(service: string, url: string): Promise<DownstreamHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const startedAt = Date.now();
    try {
      const res = await fetch(url, { signal: controller.signal });
      return {
        service,
        status: res.ok ? 'up' : 'down',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return { service, status: 'down', latencyMs: null };
    } finally {
      clearTimeout(timer);
    }
  }
}
