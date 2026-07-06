/**
 * @file        app.module.ts
 * @description Module racine du governance-service (Bloc C2/C3, port 3010). Wire
 *              la config (Zod, fail-fast), le scheduler (crons escalade SGOGT +
 *              inscription électorale), les throttlers (global anonyme + NOMMÉ
 *              `dge` anti-exfiltration), l'auth (JWKS RS256 + iss/aud), la crypto
 *              (JWS RS256 Vault Transit), l'audit (RabbitMQ → audit-service) et
 *              les modules métier : SGOGT, directives, électoral. Plus la santé.
 *
 *              ⚠️ Le throttler NOMMÉ `dge` DOIT être déclaré ici, sinon
 *              `@Throttle({ dge: … })` côté contrôleur d'export pointe vers un
 *              nom inexistant et ne limite RIEN silencieusement (cf.
 *              ELECTIONS-EXPORT-CONTRACT §7.1).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { validateEnv, type Env } from './config/env.schema.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard, RolesGuard } from './auth/guards/index.js';
import { AuditModule } from './audit/audit.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { SgogtModule } from './sgogt/sgogt.module.js';
import { DirectivesModule } from './directives/directives.module.js';
import { ElectoralModule } from './electoral/electoral.module.js';
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
        // Throttler global (anonyme) : protection de base de toutes les routes (PAR IP).
        {
          ttl: cfg.get('THROTTLE_TTL_MS', { infer: true }),
          limit: cfg.get('THROTTLE_LIMIT', { infer: true }),
        },
        // Throttler NOMMÉ `dge` : anti-exfiltration de l'export électoral (PAR IP).
        // Le nom DOIT correspondre exactement à `@Throttle({ dge: … })` côté contrôleur.
        // La garantie PAR COMPTE est portée par `ExportQuotaService` (quota atomique).
        {
          name: 'dge',
          ttl: cfg.get('DGE_THROTTLE_TTL_MS', { infer: true }),
          limit: cfg.get('DGE_THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
    AuthModule,
    AuditModule,
    CryptoModule,
    SgogtModule,
    DirectivesModule,
    ElectoralModule,
    HealthModule,
  ],
  controllers: [AppController],
  // Guards GLOBAUX (défense en profondeur) — ordre signifiant :
  //   1. JwtAuthGuard : exige un Bearer valide (sauf routes `@Public()`) ;
  //   2. RolesGuard   : applique `@Roles(...)` (no-op si absent) ;
  //   3. ThrottlerGuard : rate-limit global PAR IP + throttlers nommés (`dge`).
  // Tout NOUVEAU contrôleur est ainsi authentifié par défaut (fail-closed) : il
  // faut un `@Public()` EXPLICITE pour exposer une route (health/root). Évite
  // qu'un contrôleur oubliant `@UseGuards(...)` ne soit servi sans auth.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
