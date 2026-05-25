/**
 * @file        auth.module.ts
 * @description Module métier auth — agrège services et contrôleur.
 *
 *              Dépendances satisfaites par les modules globaux :
 *                - CryptoModule (Argon, JwtCryptoService)
 *                - RedisModule
 *                - SmsModule
 *                - KeycloakModule
 *                - UserModule (importé localement)
 *
 * @module      auth-service/modules/auth
 */

import { Module } from '@nestjs/common';

import { UserModule } from '../user/user.module.js';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleGuard } from './login-throttle.guard.js';
import { OtpService } from './otp.service.js';
import { RefreshService } from './refresh.service.js';

@Module({
  imports: [UserModule],
  controllers: [AuthController],
  providers: [AuthService, OtpService, RefreshService, LoginThrottleGuard],
  exports: [AuthService, RefreshService],
})
export class AuthModule {}
