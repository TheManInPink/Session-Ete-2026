/**
 * @file        app.module.ts
 * @description Module racine du microservice auth-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      auth-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { validateEnv } from './config/env.config.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { JwksService } from './jwks/jwks.service';
import { RedisModule } from './redis/redis.module.js';
import { VaultModule } from './vault/vault.module.js';
import { WellKnownController } from './well-known/well-known.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    // Ordre important : Vault doit être prêt avant Crypto (qui en dépend).
    VaultModule,
    RedisModule,
    CryptoModule,
  ],
  controllers: [AppController, WellKnownController],
  providers: [JwksService],
})
export class AppModule {}
