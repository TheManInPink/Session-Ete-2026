/**
 * @file        app.module.ts
 * @description Module racine de l'api-gateway. Assemble, dans l'ordre :
 *              - ConfigModule (validation Zod fail-fast via env.schema)
 *              - LoggerModule (Pino + corrélation + masquage PII)
 *              - ObservabilityModule (/metrics Prometheus + labels OTel)
 *              - RedisModule / BreakerModule / AggregatorModule / AuthModule (globaux)
 *              - HealthModule, GatewayMetaModule
 *              - ProxyModule (EN DERNIER : son catch-all `/api/v1/*` ne doit
 *                capturer que ce qui n'a pas déjà été routé)
 *
 *              GUARDS GLOBAUX (ordre important) :
 *                1. GatewayAuthGuard   — vérifie le JWT, signe X-User-Context
 *                2. RedisRateLimitGuard — limite par utilisateur (sinon par IP)
 *              Le rate-limit s'exécute APRÈS l'auth pour disposer de l'userId.
 *
 * @module      api-gateway
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CorrelationMiddleware, LoggerModule } from '@nina-aes/logger/nestjs';
import { ObservabilityModule } from '@nina-aes/observability';

import { validateEnv } from './config/env.schema.js';
import { AuthModule } from './auth/auth.module.js';
import { GatewayAuthGuard } from './auth/gateway-auth.guard.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { BreakerModule } from './infrastructure/breaker/breaker.module.js';
import { AggregatorModule } from './modules/aggregator/aggregator.module.js';
import { RedisRateLimitGuard } from './modules/rate-limit/redis-rate-limit.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { GatewayMetaModule } from './modules/gateway-meta/gateway-meta.module.js';
import { ProxyModule } from './modules/proxy/proxy.module.js';

/** Mappe NODE_ENV (4 valeurs) vers l'enum env d'observability. */
function obsEnv(): 'dev' | 'staging' | 'prod' | 'test' {
  switch (process.env.NODE_ENV) {
    case 'production':
      return 'prod';
    case 'staging':
      return 'staging';
    case 'test':
      return 'test';
    default:
      return 'dev';
  }
}

@Module({
  imports: [
    // ─── Variables d'environnement (validation Zod fail-fast) ───────────
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env', '.env'],
      expandVariables: true,
      validate: (env) => validateEnv(env as Record<string, unknown>),
    }),

    // ─── Logger structuré central — importé tôt ─────────────────────────
    LoggerModule.forRoot({
      service: 'api-gateway',
      environment: process.env.NODE_ENV,
      pretty: process.env.NODE_ENV === 'development',
      gitSha: process.env.GIT_SHA,
      lokiUrl: process.env.LOKI_URL,
    }),

    // ─── Observabilité : /metrics Prometheus + labels uniformes ─────────
    ObservabilityModule.forRoot({
      serviceName: 'api-gateway',
      serviceVersion: process.env.SERVICE_VERSION ?? '1.0.0',
      env: obsEnv(),
    }),

    // ─── Infrastructure partagée (modules globaux, sans controller) ─────
    RedisModule, // client Redis (rate limiting + health)
    BreakerModule, // registre des circuit breakers (lecture par gateway-meta)
    AggregatorModule, // spec OpenAPI agrégée + holder de la base native
    AuthModule, // JWKS verifier + UserContextSigner + GatewayAuthGuard

    // ─── Controllers locaux (AVANT le catch-all) ───────────────────────
    HealthModule,
    GatewayMetaModule,

    // ─── Proxy catch-all — DOIT rester en dernier ───────────────────────
    ProxyModule,
  ],
  providers: [
    // Ordre = ordre d'exécution : auth d'abord (peuple req.gatewayUser),
    // puis rate limiting (qui s'en sert comme clé).
    { provide: APP_GUARD, useClass: GatewayAuthGuard },
    { provide: APP_GUARD, useClass: RedisRateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  /**
   * CorrelationMiddleware en PREMIER pour que tous les logs émis pendant la
   * requête bénéficient de la propagation d'ID (X-Request-Id).
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
