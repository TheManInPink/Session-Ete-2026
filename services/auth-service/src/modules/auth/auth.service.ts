/**
 * @file        auth.service.ts
 * @description Orchestrateur des flows d'authentification.
 *
 *              Phase 4 : flow `/register` en deux étapes
 *                1. `requestRegisterOtp(phone)`  → OTP émis + SMS envoyé
 *                2. `verifyRegister(input)`     → user créé + tokens émis
 *
 *              Les phases 5-8 ajouteront ici : login, refresh, logout,
 *              MFA setup/verify, reset password, me.
 *
 *              Toutes les erreurs métier passent par {@link AUTH_ERRORS}
 *              (codes génériques, anti user-enum).
 *
 * @module      auth-service/modules/auth
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@nina-aes/database';

import { AUTH_ERRORS } from '../../common/constants.js';
import { UserRole } from '../../common/types.js';
import { JwtCryptoService } from '../../crypto/jwt.service.js';
import { KeycloakAdminService } from '../../keycloak/keycloak-admin.service.js';
import { REDIS_KEYS, TTL } from '../../common/constants.js';
import { RedisService } from '../../redis/redis.service.js';
import { SMS_PROVIDER, type SmsProvider } from '../../sms/sms.types.js';
import { UserRepository } from '../user/user.repository.js';

import type { RegisterRequestOtpDto } from './dto/register-request-otp.dto.js';
import type { RegisterVerifyDto } from './dto/register-verify.dto.js';
import { OtpService } from './otp.service.js';

/** Réponse publique du `verify` — pas de secret ni de hash. */
export interface RegisterResult {
  user: { id: string; email: string; role: UserRole };
  access: string;
  refresh: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otp: OtpService,
    private readonly users: UserRepository,
    private readonly keycloak: KeycloakAdminService,
    private readonly jwt: JwtCryptoService,
    private readonly redis: RedisService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  // ─── Register : étape 1 ───────────────────────────────────────────

  /**
   * Émet un OTP (6 chiffres, TTL 5 min) et le transmet via SMS.
   *
   * Note privacy : on n'expose JAMAIS l'état « numéro déjà inscrit » à
   * cette étape pour éviter l'énumération. Le service répond de manière
   * uniforme — l'unicité est validée en étape 2 (verify).
   */
  async requestRegisterOtp(dto: RegisterRequestOtpDto): Promise<{ ttlSeconds: number }> {
    const { phoneNumber } = dto;
    const result = await this.otp.issueRegisterOtp(phoneNumber);

    if (result.created) {
      await this.sms.send(phoneNumber, this.formatOtpMessage(result.code));
    }
    // Toujours répondre avec un TTL pour ne pas révéler `created=false`
    // à un attaquant qui sonderait le même numéro en boucle.
    return { ttlSeconds: result.ttlSeconds };
  }

  // ─── Register : étape 2 ───────────────────────────────────────────

  /**
   * Vérifie l'OTP, provisionne l'utilisateur (Keycloak + DB), émet
   * une paire access/refresh. La paire est immédiatement utilisable
   * (la MFA n'étant pas requise pour `CITIZEN`).
   */
  async verifyRegister(dto: RegisterVerifyDto): Promise<RegisterResult> {
    const otpOk = await this.otp.verifyRegisterOtp(dto.phoneNumber, dto.otp);
    if (!otpOk) {
      throw new UnauthorizedException(AUTH_ERRORS.OTP_INVALID);
    }

    const username = dto.username ?? dto.email.split('@')[0]!;
    const role = UserRole.CITIZEN;

    // 1. Création Keycloak (source de vérité du password).
    const { keycloakId } = await this.keycloak.createUser({
      username,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
      phoneNumber: dto.phoneNumber,
      role,
    });

    // 2. Création de la ligne User en DB. En cas d'échec, on ne rollback
    //    pas Keycloak ici — un job de réconciliation s'en chargera (cf.
    //    Phase 10 + doc 08). Mais on log loud pour la détection.
    let user: Awaited<ReturnType<UserRepository['create']>>;
    try {
      user = await this.users.create({
        keycloakId,
        email: dto.email,
        username,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'CITIZEN',
        phoneNumber: dto.phoneNumber,
        preferredLanguage: dto.preferredLanguage ?? 'FR',
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.error(
          `Drift Keycloak/DB : user ${keycloakId} créé dans Keycloak mais email/username déjà pris en DB`,
        );
        throw new BadRequestException('AUTH_USER_ALREADY_EXISTS');
      }
      throw err;
    }

    // 3. Émission des tokens.
    const access = this.jwt.signAccess({
      userId: user.id,
      role,
      mfa: false,
      email: user.email,
      kcSub: keycloakId,
    });
    const refresh = this.jwt.signRefresh({ userId: user.id, role });
    await this.persistRefresh(refresh.jti, user.id, refresh.family);

    return {
      user: { id: user.id, email: user.email, role },
      access,
      refresh: refresh.token,
      expiresIn: 900,
    };
  }

  // ─── interne ──────────────────────────────────────────────────────

  /**
   * Persiste l'identifiant de famille du refresh token en Redis pour la
   * détection de rejeu (Phase 5 utilisera la même clé pour vérifier).
   */
  private async persistRefresh(jti: string, userId: string, familyId: string): Promise<void> {
    await this.redis.setEx(
      REDIS_KEYS.refreshToken(jti),
      TTL.refreshFamilySeconds,
      JSON.stringify({ userId, familyId, issuedAt: Date.now() }),
    );
    await this.redis.setEx(
      REDIS_KEYS.refreshFamily(userId, familyId),
      TTL.refreshFamilySeconds,
      jti,
    );
  }

  private formatOtpMessage(code: string): string {
    return `NINA-AES : votre code de validation est ${code}. Valable 5 minutes. Ne le partagez à personne.`;
  }
}
