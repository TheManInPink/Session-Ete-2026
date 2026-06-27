/**
 * @file        health.controller.ts
 * @description Healthcheck Terminus — Postgres (dépendance critique) + Redis
 *              (anti-replay / rate-limit fail-closed).
 *
 *                GET /health        — détaillé (exclu du préfixe api/v1)
 *                GET /health/live   — liveness (process up)
 *                GET /health/ready  — readiness (Postgres + Redis requis)
 *
 *              ⚠️ Contrairement à l'appointment-service (Redis indicatif), ici
 *              Redis est REQUIS pour la readiness : sans lui, l'anti-replay et le
 *              rate-limit fail-closent (503) → le pod ne doit pas recevoir de
 *              trafic BCID-AES.
 *
 *              Marqué `@Public()` (cohérent inter-services, à l'épreuve d'un
 *              futur APP_GUARD).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/modules/health
 */
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  PrismaHealthIndicator,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@nina-aes/auth-guards';
import { prisma } from '@nina-aes/database';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly hc: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Healthcheck détaillé (Postgres + Redis requis)' })
  check() {
    return this.hc.check([
      async () => this.db.pingCheck('postgres', prisma as never),
      async () => this.redisIndicator(),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness — process up' })
  live(): { status: 'live'; service: 'interop-service'; timestamp: string } {
    return { status: 'live', service: 'interop-service', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — Postgres + Redis requis (fail-closed BCID-AES)' })
  ready() {
    return this.hc.check([
      async () => this.db.pingCheck('postgres', prisma as never),
      async () => this.redisIndicator(),
    ]);
  }

  /**
   * Indicateur Redis BLOQUANT : si Redis est injoignable, on lève une
   * `HealthCheckError` (statut `down`) — l'anti-replay et le rate-limit
   * dépendent de Redis (fail-closed), donc un nœud sans Redis n'est pas prêt.
   */
  private async redisIndicator(): Promise<HealthIndicatorResult> {
    const reachable = await this.redis.ping();
    const result: HealthIndicatorResult = {
      redis: { status: reachable ? 'up' : 'down', reachable },
    };
    if (!reachable) {
      throw new HealthCheckError('Redis injoignable (anti-replay/rate-limit fail-closed)', result);
    }
    return result;
  }
}
