/**
 * @file        app.module.ts
 * @description Module racine du microservice auth-service.
 *
 *              Wiring de haut niveau :
 *                - `ConfigModule` global avec validation Zod fail-fast.
 *                - `VaultModule` (charge les clés JWT au boot).
 *                - `RedisModule` (refresh tokens, OTP, throttle).
 *                - `CryptoModule` (Argon2 + JwtCryptoService).
 *                - Guards globaux APP_GUARD dans l'ordre :
 *                  JwtAuthGuard → RolesGuard → MfaGuard.
 *                  Toute route doit explicitement opt-out via `@Public()`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      auth-service
 */

import { Module, type Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  JWT_VERIFIER,
  type JwtVerifier,
  JwtAuthGuard,
  MfaGuard,
  RolesGuard,
} from '@nina-aes/auth-guards';

import { AppController } from './app.controller';
import { validateEnv } from './config/env.config.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { JwtCryptoService } from './crypto/jwt.service.js';
import { JwksService } from './jwks/jwks.service';
import { KeycloakModule } from './keycloak/keycloak.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SmsModule } from './sms/sms.module.js';
import { VaultModule } from './vault/vault.module.js';
import { WellKnownController } from './well-known/well-known.controller';

/**
 * Adapter qui projette un `JwtAccessPayload` (interne) en `AuthSubject`
 * (contrat public de `@nina-aes/auth-guards`). Évite de coupler le package
 * de guards aux types internes du service.
 */
const jwtVerifierProvider: Provider = {
  provide: JWT_VERIFIER,
  useFactory: (jwt: JwtCryptoService): JwtVerifier => ({
    verifyAccess: (token: string) => {
      const p = jwt.verifyAccess(token);
      return {
        userId: p.sub,
        role: p.role,
        mfa: p.mfa,
        ...(p.email !== undefined ? { email: p.email } : {}),
        ...(p.kcSub !== undefined ? { kcSub: p.kcSub } : {}),
      };
    },
  }),
  inject: [JwtCryptoService],
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Charge le .env racine du monorepo en priorité (DATABASE_URL etc.
      // y est défini en référence aux POSTGRES_*). expandVariables=true
      // pour résoudre ${VAR} composés.
      envFilePath: ['../../.env', '.env.local', '.env'],
      expandVariables: true,
      validate: validateEnv,
    }),
    // Ordre important : Vault doit être prêt avant Crypto (qui en dépend).
    VaultModule,
    RedisModule,
    CryptoModule,
    SmsModule,
    KeycloakModule,
    AuthModule,
  ],
  controllers: [AppController, WellKnownController],
  providers: [
    JwksService,
    jwtVerifierProvider,
    // Ordre de déclaration = ordre d'exécution des guards globaux.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MfaGuard },
  ],
})
export class AppModule {}
