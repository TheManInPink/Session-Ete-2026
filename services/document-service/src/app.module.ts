/**
 * @file        app.module.ts
 * @description Module racine du microservice document-service.
 *              Les modules métier (Qr, Pdf, Template, Storage, Fdi, Documents)
 *              sont ajoutés progressivement aux phases 4 → 9.
 * @module      document-service
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { validateEnv, type Env } from './config/env.schema';
import { AppController } from './app.controller';
import { HealthModule } from './modules/health/health.module';
import { IdentityClientModule } from './identity-client/identity-client.module';
import { RedisModule } from './redis/redis.module';
import { VaultModule } from './vault/vault.module';
import { QrModule } from './qr/qr.module';
import { TemplateModule } from './templates/template.module';
import { PdfModule } from './pdf/pdf.module';
import { StorageModule } from './storage/storage.module';
import { AuditPublisherModule } from './audit/audit-publisher.module';
import { FdiModule } from './fdi/fdi.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Charge le .env racine du monorepo (priorité racine — DATABASE_URL
      // etc. y est défini en référence aux POSTGRES_*).
      // expandVariables=true pour résoudre ${VAR} style.
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
    TerminusModule,
    RedisModule,
    VaultModule,
    IdentityClientModule,
    QrModule,
    TemplateModule,
    PdfModule,
    StorageModule,
    AuditPublisherModule,
    AuthModule,
    FdiModule,
    DocumentsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
