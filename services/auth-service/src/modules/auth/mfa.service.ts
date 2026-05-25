/**
 * @file        mfa.service.ts
 * @description Orchestre les flows MFA (TOTP + SMS).
 *
 *              TOTP (RFC 6238) :
 *                1. `setupTotp(userId)`  → génère un secret base32, le
 *                   persiste en Redis (TTL 10 min, key `mfa:totp:pending`)
 *                   et retourne {secret, otpauthUri, qrDataUrl}.
 *                2. `confirmTotp(userId, code)` → vérifie le code via le
 *                   secret pending, chiffre le secret via Vault Transit,
 *                   active `mfaEnabled` en DB. Le secret pending est purgé.
 *                3. `verifyTotpChallenge(challenge, code)` → décode le
 *                   challenge JWT, vérifie le code contre le secret DB
 *                   déchiffré, marque le challenge comme consommé et
 *                   renvoie le payload à AuthService pour émettre la session.
 *
 *              SMS :
 *                4. `challengeSms(challenge)` → vérifie le challenge, émet
 *                   un OTP 6 chiffres en Redis (réutilise OtpService) +
 *                   envoie le code via SmsProvider.
 *                5. `verifySmsChallenge(challenge, code)` → vérifie OTP
 *                   + marque le challenge comme consommé.
 *
 *              Sécurité :
 *                - Anti-rejeu sur le challenge : `mfa:challenge:<jti>`
 *                  marqué après consommation, vérifié avant utilisation.
 *                - Anti-bypass setup : impossible de confirmer si pas de
 *                  secret pending (le user a contourné /setup).
 *
 * @module      auth-service/modules/auth
 */

import { randomInt } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';

import { AUTH_ERRORS, REDIS_KEYS, TTL } from '../../common/constants.js';
import { JwtCryptoService } from '../../crypto/jwt.service.js';
import type { AppEnv } from '../../config/env.config.js';
import { ArgonService } from '../../crypto/argon.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { SMS_PROVIDER, type SmsProvider } from '../../sms/sms.types.js';
import { VaultService } from '../../vault/vault.service.js';
import { UserRepository } from '../user/user.repository.js';

/** Résultat de `setupTotp` — destiné à être consommé par le client. */
export interface SetupTotpResult {
  /** Secret base32 (à scanner manuellement si le QR ne passe pas). */
  secret: string;
  /** URI `otpauth://` complète. */
  otpauthUri: string;
  /** QR code data URL (image/png base64) prêt à être affiché. */
  qrDataUrl: string;
}

/** Données validées à propager à AuthService pour émettre la session. */
export interface MfaVerifyResult {
  userId: string;
  kcSub: string;
  /** Le rôle est lu du challenge — il a été validé au login. */
  role: string;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly redis: RedisService,
    private readonly argon: ArgonService,
    private readonly jwt: JwtCryptoService,
    private readonly vault: VaultService,
    private readonly config: ConfigService<AppEnv, true>,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    authenticator.options = {
      window: this.config.get('MFA_TOTP_WINDOW', { infer: true }),
    };
  }

  // ─── TOTP ─────────────────────────────────────────────────────────

  /**
   * Génère un secret TOTP + le persiste en Redis (pending). Idempotent :
   * un appel répété écrase le précédent — utile si l'utilisateur perd
   * son QR avant confirmation.
   */
  async setupTotp(userId: string, email: string): Promise<SetupTotpResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
    if (user.mfaEnabled) {
      throw new ConflictException('AUTH_MFA_ALREADY_ENABLED');
    }

    const secret = authenticator.generateSecret();
    const issuer = this.config.get('MFA_TOTP_ISSUER', { infer: true });
    const otpauthUri = authenticator.keyuri(email, issuer, secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M' });

    await this.redis.setEx(REDIS_KEYS.mfaTotpPending(userId), TTL.mfaTotpPendingSeconds, secret);

    return { secret, otpauthUri, qrDataUrl };
  }

  /**
   * Vérifie le code TOTP contre le secret pending, chiffre et persiste
   * le secret en DB. Le secret pending est purgé sur succès.
   */
  async confirmTotp(userId: string, code: string): Promise<void> {
    const pending = await this.redis.get(REDIS_KEYS.mfaTotpPending(userId));
    if (!pending) throw new UnauthorizedException(AUTH_ERRORS.OTP_INVALID);

    const ok = authenticator.verify({ token: code, secret: pending });
    if (!ok) throw new UnauthorizedException(AUTH_ERRORS.OTP_INVALID);

    const encrypted = await this.vault.encryptMfaSecret(pending);
    await this.users.enableMfaTotp(userId, encrypted);
    await this.redis.del(REDIS_KEYS.mfaTotpPending(userId));
    this.logger.log(`MFA TOTP activé pour user ${userId}`);
  }

  // ─── Verify : flow login ─────────────────────────────────────────

  /**
   * Vérifie un code TOTP soumis dans le flow login (avec un challenge JWT).
   * Le secret est lu depuis la DB (déchiffré via Vault Transit).
   */
  async verifyTotpChallenge(challengeToken: string, code: string): Promise<MfaVerifyResult> {
    const challenge = await this.consumeChallenge(challengeToken);

    const user = await this.users.findById(challenge.sub);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException(AUTH_ERRORS.MFA_REQUIRED);
    }

    const secret = await this.vault.decryptMfaSecret(user.mfaSecret);
    const ok = authenticator.verify({ token: code, secret });
    if (!ok) throw new UnauthorizedException(AUTH_ERRORS.OTP_INVALID);

    return { userId: user.id, kcSub: user.keycloakId, role: user.role };
  }

  // ─── SMS challenge ───────────────────────────────────────────────

  /**
   * Émet un OTP SMS à 6 chiffres pour un user en cours d'authentification.
   * Le challenge JWT n'est PAS consommé ici — il l'est uniquement à la
   * vérification finale, pour permettre un renvoi en cas de SMS perdu.
   */
  async challengeSms(challengeToken: string): Promise<{ ttlSeconds: number }> {
    const challenge = this.jwt.verifyMfaChallenge(challengeToken);
    if (await this.isChallengeUsed(challenge.jti)) {
      throw new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
    }

    const user = await this.users.findById(challenge.sub);
    if (!user?.phoneNumber) {
      throw new UnauthorizedException(AUTH_ERRORS.MFA_REQUIRED);
    }

    const code = this.generate6DigitCode();
    const hash = await this.argon.hash(code);
    await this.redis.setEx(REDIS_KEYS.otpMfa(user.id), TTL.otpMfaSeconds, hash);

    await this.sms.send(
      user.phoneNumber,
      `NINA-AES : code de connexion ${code}. Valable 5 minutes.`,
    );
    return { ttlSeconds: TTL.otpMfaSeconds };
  }

  /** Vérifie un OTP SMS soumis dans le flow login. */
  async verifySmsChallenge(challengeToken: string, code: string): Promise<MfaVerifyResult> {
    const challenge = await this.consumeChallenge(challengeToken);

    const key = REDIS_KEYS.otpMfa(challenge.sub);
    const stored = await this.redis.get(key);
    if (!stored) throw new UnauthorizedException(AUTH_ERRORS.OTP_INVALID);

    const ok = await this.argon.verify(stored, code);
    if (!ok) throw new UnauthorizedException(AUTH_ERRORS.OTP_INVALID);
    await this.redis.del(key);

    return { userId: challenge.sub, kcSub: challenge.kcSub, role: challenge.role };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  /**
   * Vérifie + consomme un challenge en un seul appel (anti-rejeu).
   * Lève si le jti est déjà marqué comme utilisé.
   */
  private async consumeChallenge(
    token: string,
  ): Promise<{ sub: string; jti: string; kcSub: string; role: string }> {
    const decoded = this.jwt.verifyMfaChallenge(token);
    const created = await this.redis.setNxEx(
      REDIS_KEYS.mfaChallengeUsed(decoded.jti),
      TTL.mfaChallengeUsedSeconds,
      '1',
    );
    if (!created) {
      throw new UnauthorizedException(AUTH_ERRORS.TOKEN_INVALID);
    }
    return { sub: decoded.sub, jti: decoded.jti, kcSub: decoded.kcSub, role: decoded.role };
  }

  private async isChallengeUsed(jti: string): Promise<boolean> {
    return this.redis.exists(REDIS_KEYS.mfaChallengeUsed(jti));
  }

  private generate6DigitCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
