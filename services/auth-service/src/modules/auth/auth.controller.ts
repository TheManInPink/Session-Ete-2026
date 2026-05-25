/**
 * @file        auth.controller.ts
 * @description Contrôleur HTTP du module auth.
 *
 *              Phase 4 — endpoints publics (opt-out des guards globaux
 *              via `@Public()`) :
 *                - POST /auth/register/request-otp
 *                - POST /auth/register/verify
 *
 *              Validation des bodies via {@link ZodValidationPipe}.
 *
 * @module      auth-service/modules/auth
 */

import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes } from '@nestjs/common';
import { Public } from '@nina-aes/auth-guards';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';

import { AuthService, type RegisterResult } from './auth.service.js';
import {
  type RegisterRequestOtpDto,
  RegisterRequestOtpSchema,
} from './dto/register-request-otp.dto.js';
import { type RegisterVerifyDto, RegisterVerifySchema } from './dto/register-verify.dto.js';

@Controller('auth/register')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Demande l'émission d'un OTP SMS pour le numéro fourni. Réponse uniforme
   * (pas d'indication d'unicité côté téléphone à cette étape).
   */
  @Public()
  @Post('request-otp')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(RegisterRequestOtpSchema))
  requestOtp(@Body() dto: RegisterRequestOtpDto): Promise<{ ttlSeconds: number }> {
    return this.auth.requestRegisterOtp(dto);
  }

  /**
   * Vérifie l'OTP, crée le user dans Keycloak + DB, retourne une paire
   * access / refresh immédiatement utilisable.
   */
  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(RegisterVerifySchema))
  verify(@Body() dto: RegisterVerifyDto): Promise<RegisterResult> {
    return this.auth.verifyRegister(dto);
  }
}
