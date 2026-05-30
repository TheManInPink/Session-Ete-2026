/**
 * @file        health.controller.ts
 * @description Healthcheck enrichi : MinIO (bucket fiches) + identity-service
 *              + Postgres. Vault et RabbitMQ sont best-effort (échec n'invalide
 *              pas le service, juste un warn).
 *
 *              GET /health         — détaillé (exclu du préfixe api/v1)
 *              GET /health/live    — liveness (toujours 200 si process up)
 *              GET /health/ready   — readiness (deps critiques)
 *
 * @module      document-service/modules/health
 */
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@nina-aes/auth-guards';
import { prisma } from '@nina-aes/database';
import { MinioService } from '../../storage/minio.service';
import { IdentityClient } from '../../identity-client/identity.client';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly hc: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly minio: MinioService,
    private readonly identity: IdentityClient,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Healthcheck détaillé (Postgres + MinIO + identity)' })
  check() {
    return this.hc.check([
      async () => this.db.pingCheck('postgres', prisma as never),
      async (): Promise<HealthIndicatorResult> => {
        const ok = await this.minio.ping();
        return { minio: { status: ok ? 'up' : 'down' } };
      },
      async (): Promise<HealthIndicatorResult> => {
        const ok = await this.identity.ping();
        return { 'identity-service': { status: ok ? 'up' : 'down' } };
      },
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process up' })
  live(): { status: 'live'; service: 'document-service'; timestamp: string } {
    return {
      status: 'live',
      service: 'document-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — Postgres + MinIO obligatoires' })
  ready() {
    return this.hc.check([
      async () => this.db.pingCheck('postgres', prisma as never),
      async (): Promise<HealthIndicatorResult> => {
        const ok = await this.minio.ping();
        if (!ok) throw new Error('MinIO bucket fiches indisponible');
        return { minio: { status: 'up' } };
      },
    ]);
  }
}
