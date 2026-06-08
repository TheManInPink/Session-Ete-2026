/**
 * @file        health.controller.ts
 * @description Healthcheck Terminus — Postgres (historique des notifications).
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
 * @module      notification-service/modules/health
 */
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@nina-aes/auth-guards';
import { prisma } from '@nina-aes/database';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly hc: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Healthcheck détaillé (Postgres)' })
  check() {
    return this.hc.check([async () => this.db.pingCheck('postgres', prisma as never)]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness — process up' })
  live(): { status: 'live'; service: 'notification-service'; timestamp: string } {
    return { status: 'live', service: 'notification-service', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — Postgres requis' })
  ready() {
    return this.hc.check([async () => this.db.pingCheck('postgres', prisma as never)]);
  }
}
