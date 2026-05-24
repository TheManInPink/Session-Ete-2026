/**
 * @file        app.module.ts
 * @description Module racine de l'api-gateway. Configure :
 *              - le LoggerModule (Pino + corrélation + masquage PII)
 *              - le ThrottlerModule (rate limiting Redis-backed)
 *              - le ProxyModule (routage vers les 14 services internes)
 *              - le HealthModule (Terminus /health)
 *
 * @module      api-gateway
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CorrelationMiddleware, LoggerModule } from '@nina-aes/logger/nestjs';

import { HealthModule } from './modules/health/health.module.js';
import { ProxyModule } from './modules/proxy/proxy.module.js';

@Module({
  imports: [
    // ─── Variables d'environnement (validation Zod via @nina-aes/config) ──
    ConfigModule.forRoot({ isGlobal: true }),

    // ─── Logger structuré central — DOIT être importé en premier ────────
    LoggerModule.forRoot({
      service: 'api-gateway',
      environment: process.env.NODE_ENV,
      pretty: process.env.NODE_ENV === 'development',
      gitSha: process.env.GIT_SHA,
      lokiUrl: process.env.LOKI_URL,
    }),

    // ─── Rate limiting — 100 req/min par défaut, ajustable par env ──────
    // POURQUOI : protège l'ensemble des services aval contre les ruées
    //           (ex. attaque d'énumération de NINA depuis Internet).
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_SECONDS ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),

    HealthModule,
    ProxyModule,
  ],
  providers: [
    // Guard global appliquant le throttling à TOUTES les routes
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  /**
   * Configuration des middlewares.
   *
   * ORDRE CRITIQUE : CorrelationMiddleware en PREMIER pour que tous les logs
   * émis pendant le traitement bénéficient de la propagation d'ID.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
