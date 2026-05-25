/**
 * @file        mfa.controller.ts
 * @description Endpoints MFA — TOTP setup/confirm + verify (TOTP & SMS).
 *
 *              - `setup` / `confirm` exigent une session active (le user
 *                doit être authentifié pour activer le MFA sur son compte).
 *              - `challenge-sms` / `verify-totp` / `verify-sms` sont publics
 *                car ils sont appelés dans le flow login : le user n'a pas
 *                encore d'access token complet, seulement le challenge.
 *
 *              Sur succès, les endpoints `verify-*` émettent une session
 *              complète avec `mfa: true` (Cf. {@link AuthService.completeMfa}).
 *
 * @module      auth-service/modules/auth
 */

import { Body, Controller, HttpCode, HttpStatus, Post, Req, UsePipes } from '@nestjs/common';
import { Public, type AuthSubject } from '@nina-aes/auth-guards';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import type { UserRole } from '../../common/types.js';

import { AuthService, type AuthSession } from './auth.service.js';
import {
  type MfaChallengeSmsDto,
  MfaChallengeSmsSchema,
  type MfaConfirmTotpDto,
  MfaConfirmTotpSchema,
  type MfaVerifySmsDto,
  MfaVerifySmsSchema,
  type MfaVerifyTotpDto,
  MfaVerifyTotpSchema,
} from './dto/mfa.dto.js';
import { MfaService, type SetupTotpResult } from './mfa.service.js';

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
  ) {}

  // ─── TOTP : enrôlement (user authentifié) ────────────────────────

  /**
   * Initie l'enrôlement TOTP — retourne le secret + le QR code à scanner
   * dans une app authenticator. Le secret est stocké temporairement en
   * Redis (TTL 10 min) jusqu'à confirmation.
   */
  @Post('totp/setup')
  @HttpCode(HttpStatus.OK)
  setupTotp(@Req() req: { user: AuthSubject; userEmail?: string }): Promise<SetupTotpResult> {
    return this.mfa.setupTotp(req.user.userId, req.user.email ?? `user-${req.user.userId}`);
  }

  /**
   * Confirme l'enrôlement TOTP — vérifie le code généré par l'app, chiffre
   * le secret via Vault Transit, l'écrit en DB et active `mfaEnabled`.
   */
  @Post('totp/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ZodValidationPipe(MfaConfirmTotpSchema))
  async confirmTotp(
    @Req() req: { user: AuthSubject },
    @Body() dto: MfaConfirmTotpDto,
  ): Promise<void> {
    await this.mfa.confirmTotp(req.user.userId, dto.code);
  }

  // ─── TOTP : vérification au login (public, via challenge) ────────

  @Public()
  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(MfaVerifyTotpSchema))
  async verifyTotp(@Body() dto: MfaVerifyTotpDto): Promise<AuthSession> {
    const ok = await this.mfa.verifyTotpChallenge(dto.challenge, dto.code);
    return this.auth.completeMfa({
      userId: ok.userId,
      role: ok.role as UserRole,
      kcSub: ok.kcSub,
    });
  }

  // ─── SMS : challenge + verify (public, via challenge) ────────────

  @Public()
  @Post('sms/challenge')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ZodValidationPipe(MfaChallengeSmsSchema))
  challengeSms(@Body() dto: MfaChallengeSmsDto): Promise<{ ttlSeconds: number }> {
    return this.mfa.challengeSms(dto.challenge);
  }

  @Public()
  @Post('sms/verify')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(MfaVerifySmsSchema))
  async verifySms(@Body() dto: MfaVerifySmsDto): Promise<AuthSession> {
    const ok = await this.mfa.verifySmsChallenge(dto.challenge, dto.code);
    return this.auth.completeMfa({
      userId: ok.userId,
      role: ok.role as UserRole,
      kcSub: ok.kcSub,
    });
  }
}
