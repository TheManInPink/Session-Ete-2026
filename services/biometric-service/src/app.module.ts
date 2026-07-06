/**
 * @file        app.module.ts
 * @description Module racine du biometric-service (Bloc F, port 3012 — le module
 *              le plus sensible). Wire la config (Zod, fail-fast), le throttler,
 *              le gate DPIA/RGPD bloquant, Vault (paramètre cancelable), l'auth
 *              (JWKS RS256 agent + iss/aud), l'audit (RabbitMQ + trace durable),
 *              la protection de template cancelable (ISO/IEC 24745), les templates
 *              protégés, et les modules métier : consentement (JWS Ed25519 ancré),
 *              enrôlement, vérification 1:1 + identification 1:N restreinte. Plus
 *              la santé.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { validateEnv, type Env } from './config/env.schema.js';
import { GovernanceModule } from './governance/governance.module.js';
import { VaultModule } from './vault/vault.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { CancelableModule } from './cancelable/cancelable.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { ConsentModule } from './consent/consent.module.js';
import { EnrollmentModule } from './enrollment/enrollment.module.js';
import { VerifyModule } from './verify/verify.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Charge le .env racine du monorepo en priorité (DATABASE_URL, RABBITMQ_URL).
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
    // Gate de gouvernance EN PREMIER (fail-fast au boot en prod si DPIA non signée).
    GovernanceModule,
    VaultModule,
    AuthModule,
    AuditModule,
    CancelableModule,
    TemplatesModule,
    ConsentModule,
    EnrollmentModule,
    VerifyModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
