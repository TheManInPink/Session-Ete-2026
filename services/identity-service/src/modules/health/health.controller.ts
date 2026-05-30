/**
 * @file        health.controller.ts
 * @description Endpoint /health (liveness + readiness) + dépendances.
 *
 *              Trois routes :
 *                /health         — readiness complète (DB + Redis + RabbitMQ + AI)
 *                /health/live    — liveness simple (process up)
 *                /health/ready   — readiness sans externes optionnels
 *
 *              Format réponse compatible Kubernetes httpGet probes.
 *
 * @module      identity-service/health
 */

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { prisma } from '@nina-aes/database';

import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

const AI_URL = process.env.AI_SERVICE_URL ?? 'http://ai-service:3003';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly httpIndicator: HttpHealthIndicator,
    private readonly redis: RedisService,
    private readonly rabbit: RabbitMQService,
  ) {}

  // ─── /health (readiness complète) ─────────────────────────────
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — DB + Redis + RabbitMQ + ai-service' })
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      // DB Postgres via Prisma
      async (): Promise<HealthIndicatorResult> => {
        try {
          await prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up' } };
        } catch (err) {
          return {
            database: {
              status: 'down',
              message: (err as Error).message,
            },
          };
        }
      },

      // Redis cache
      async (): Promise<HealthIndicatorResult> => {
        const ok = await this.redis.ping();
        return { redis: { status: ok ? 'up' : 'down' } };
      },

      // RabbitMQ events (best-effort : OK même si DOWN car publish est best-effort)
      async (): Promise<HealthIndicatorResult> => ({
        rabbitmq: { status: this.rabbit.isConnected() ? 'up' : 'down' },
      }),

      // ai-service (HTTP /health/live, optionnel — best-effort : ne casse jamais la readiness)
      async (): Promise<HealthIndicatorResult> => {
        try {
          const result = await this.httpIndicator.pingCheck('ai-service', `${AI_URL}/health/live`, {
            timeout: 2_000,
          });
          // Terminus 11 : pingCheck RENVOIE un résultat `down` (au lieu de throw) sur
          // erreur réseau (ECONNREFUSED/timeout). On le requalifie en `up` car ai-service
          // est optionnel — son indisponibilité ne doit pas faire échouer /health.
          if (result['ai-service']?.status === 'down') {
            return { 'ai-service': { status: 'up', warning: 'unreachable' } };
          }
          return result;
        } catch {
          // Erreur non-Axios (rare) — best-effort identique.
          return { 'ai-service': { status: 'up', warning: 'unreachable' } };
        }
      },
    ]);
  }

  // ─── /health/live (liveness — process up) ─────────────────────
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process actif' })
  liveness(): { status: 'ok'; uptime: number; timestamp: string } {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  // ─── /health/ready (readiness sans externes optionnels) ──────
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — DB + Redis seulement' })
  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        try {
          await prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up' } };
        } catch (err) {
          return { database: { status: 'down', message: (err as Error).message } };
        }
      },
      async (): Promise<HealthIndicatorResult> => {
        const ok = await this.redis.ping();
        return { redis: { status: ok ? 'up' : 'down' } };
      },
    ]);
  }
}
