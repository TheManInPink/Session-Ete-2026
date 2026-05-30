/**
 * @file        app.module.ts
 * @description Module racine de l'audit-service. Wire la config (Zod), le
 *              scheduler (cron de scellement), le throttler, l'auth (JWKS), le
 *              client Vault, le module métier d'audit et la santé.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { validateEnv, type Env } from './config/env.schema.js';
import { AuthModule } from './auth/auth.module.js';
import { VaultModule } from './vault/vault.module.js';
import { AuditModule } from './audit/audit.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Charge le .env racine du monorepo en priorité (DATABASE_URL y référence
      // les POSTGRES_*). expandVariables résout les ${VAR}.
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
    VaultModule,
    AuditModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
