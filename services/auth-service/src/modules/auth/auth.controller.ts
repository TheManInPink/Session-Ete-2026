/**
 * @file        auth.controller.ts
 * @description Contrôleur HTTP du module auth.
 *
 *              Endpoints livrés :
 *                Phase 4
 *                - POST /auth/register/request-otp       (public)
 *                - POST /auth/register/verify            (public)
 *                Phase 5
 *                - POST /auth/login                      (public, throttled 5/15min/IP)
 *                - POST /auth/refresh                    (public)
 *                - POST /auth/logout                     (public, idempotent)
 *
 *              Validation des bodies via {@link ZodValidationPipe}.
 *
 * @module      auth-service/modules/auth
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Public } from '@nina-aes/auth-guards';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';

import { AuthService, type AuthSession, type MfaPending } from './auth.service.js';
import { type LoginDto, LoginSchema } from './dto/login.dto.js';
import { type LogoutDto, LogoutSchema } from './dto/logout.dto.js';
import { type RefreshDto, RefreshSchema } from './dto/refresh.dto.js';
import {
  type RegisterRequestOtpDto,
  RegisterRequestOtpSchema,
} from './dto/register-request-otp.dto.js';
import { type RegisterVerifyDto, RegisterVerifySchema } from './dto/register-verify.dto.js';
import { LoginThrottleGuard } from './login-throttle.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ─── Register ─────────────────────────────────────────────────────

  @Public()
  @Post('register/request-otp')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(RegisterRequestOtpSchema))
  requestOtp(@Body() dto: RegisterRequestOtpDto): Promise<{ ttlSeconds: number }> {
    return this.auth.requestRegisterOtp(dto);
  }

  @Public()
  @Post('register/verify')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(RegisterVerifySchema))
  verify(@Body() dto: RegisterVerifyDto): Promise<AuthSession> {
    return this.auth.verifyRegister(dto);
  }

  // ─── Login / Refresh / Logout ────────────────────────────────────

  /**
   * Authentification par password. Le LoginThrottleGuard incrémente le
   * compteur d'IP AVANT de passer au handler — un login réussi efface
   * la clé Redis correspondante (cf. {@link AuthService.resetLoginThrottle}).
   */
  @Public()
  @UseGuards(LoginThrottleGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() dto: LoginDto, @Ip() ip: string): Promise<AuthSession | MfaPending> {
    const result = await this.auth.login(dto);
    // Reset throttle uniquement si la session est complète. Les cas
    // « MFA pending » ne réinitialisent pas — l'IP reste rate-limitée
    // tant que la MFA n'a pas validé (Phase 6).
    if ('access' in result) {
      await this.auth.resetLoginThrottle(ip);
    }
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(RefreshSchema))
  refresh(
    @Body() dto: RefreshDto,
  ): Promise<{ access: string; refresh: string; expiresIn: number }> {
    return this.auth.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ZodValidationPipe(LogoutSchema))
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto);
  }
}
