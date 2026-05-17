/**
 * @file        app.module.ts
 * @description Module racine identity-service — wire de tous les modules :
 *
 *                Globaux :
 *                  - ConfigModule (@nestjs/config, lit .env)
 *                  - ThrottlerModule (rate limiting 100 req/min/IP par défaut)
 *                  - ObservabilityModule (/metrics + traces OTel)
 *                  - RedisModule (cache + sessions)
 *                  - RabbitMQModule (publisher events)
 *
 *                Métier :
 *                  - CitizenModule
 *                  - CorrectionModule
 *                  - LocationModule
 *                  - HealthModule
 *
 * @module      identity-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ObservabilityModule } from '@nina-aes/observability';

import { AppController } from './app.controller';
import { CitizenModule } from './modules/citizen/citizen.module';
import { CorrectionModule } from './modules/correction/correction.module';
import { LocationModule } from './modules/location/location.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RabbitMQModule } from './infrastructure/rabbitmq/rabbitmq.module';

@Module({
  imports: [
    // ─── Globaux ───────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),

    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_SECONDS ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),

    ObservabilityModule.forRoot({
      serviceName: 'identity-service',
      serviceVersion: process.env.SERVICE_VERSION ?? '0.1.0',
      env: (process.env.ENV ?? 'dev') as 'dev' | 'staging' | 'prod',
    }),

    RedisModule,
    RabbitMQModule,

    // ─── Métier ────────────────────────────────────────────────────
    CitizenModule,
    CorrectionModule,
    LocationModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
