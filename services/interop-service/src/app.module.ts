/**
 * @file        app.module.ts
 * @description Module racine de l'interop-service (BCID-AES, port 3006). Wire la
 *              config (Zod, fail-fast), le throttler HTTP générique, l'auth JWT
 *              interne (JWKS), Redis (anti-replay + rate-limit), Vault (clé JWS
 *              Ed25519), le module métier BCID et la santé.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { validateEnv, type Env } from './config/env.schema.js';
import { AuthModule } from './auth/auth.module.js';
import { VaultModule } from './vault/vault.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { BcidModule } from './bcid/bcid.module.js';
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
    RedisModule,
    BcidModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
