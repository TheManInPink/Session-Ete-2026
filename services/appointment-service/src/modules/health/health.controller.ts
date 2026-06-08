/**
 * @file        health.controller.ts
 * @description Healthcheck Terminus — Postgres (centres/RDV) + Redis (file
 *              d'attente, indicatif : son indisponibilité ne casse pas la
 *              readiness car la file dégrade proprement, cf. RedisService).
 *
 *                GET /health        — détaillé (exclu du préfixe api/v1)
 *                GET /health/live   — liveness (process up)
 *                GET /health/ready  — readiness (Postgres requis)
 *
 *              Marqué `@Public()` (cohérent inter-services, à l'épreuve d'un
 *              futur APP_GUARD).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/modules/health
 */
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
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
  @ApiOperation({ summary: 'Healthcheck détaillé (Postgres requis, Redis indicatif)' })
  check() {
    return this.hc.check([
      async () => this.db.pingCheck('postgres', prisma as never),
      async () => this.redisIndicator(),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness — process up' })
  live(): { status: 'live'; service: 'appointment-service'; timestamp: string } {
    return { status: 'live', service: 'appointment-service', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — Postgres requis' })
  ready() {
    return this.hc.check([async () => this.db.pingCheck('postgres', prisma as never)]);
  }

  /**
   * Indicateur Redis « best-effort » : remonte l'accessibilité (up/down) sans
   * la rendre bloquante — on renvoie toujours un statut `up` dont le détail
   * `reachable` reflète l'état réel. Ainsi `/health` reste vert même si Redis
   * est momentanément absent (la prise de RDV ne dépend que de Postgres).
   */
  private async redisIndicator(): Promise<HealthIndicatorResult> {
    const reachable = await this.redis.ping();
    return { redis: { status: 'up', reachable } };
  }
}
