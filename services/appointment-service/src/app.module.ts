/**
 * @file        app.module.ts
 * @description Module racine de l'appointment-service. Wire la config (Zod), le
 *              scheduler (rappels + no-show), le throttler, l'auth (JWKS), Redis
 *              (file d'attente + blacklist), les modules métier (centres,
 *              rendez-vous) et la santé.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { validateEnv, type Env } from './config/env.schema.js';
import { AuthModule } from './auth/auth.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { CentersModule } from './centers/centers.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Charge le .env racine du monorepo en priorité (DATABASE_URL, REDIS_URL,
      // RABBITMQ_URL). expandVariables résout les ${VAR}.
      envFilePath: ['../../.env', '.env'],
      expandVariables: true,
      validate: (env) => validateEnv(env as Record<string, unknown>),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<Env, true>) => [
        {
          ttl: cfg.get('THROTTLE_TTL_MS', { infer: true }),
          limit: cfg.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
    AuthModule,
    RedisModule,
    CentersModule,
    AppointmentsModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
