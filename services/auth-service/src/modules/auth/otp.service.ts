/**
 * @file        otp.service.ts
 * @description Génération, stockage et vérification des OTP SMS.
 *
 *              Défense en profondeur : l'OTP n'est jamais stocké en clair
 *              dans Redis. On y stocke le hash Argon2id du code ; la
 *              vérification compare le hash. Cela limite l'impact d'une
 *              compromission Redis (snapshot, dump RDB, lecture lecture
 *              via injection).
 *
 *              TTL Redis = `TTL.otpRegisterSeconds` (5 min) — défini dans
 *              `common/constants.ts` pour éviter la dérive de configuration.
 *
 *              `setNxEx` est utilisé pour empêcher l'écrasement d'un OTP
 *              valide par une demande répétée (rate-limit implicite côté
 *              register avant le Throttler global de Phase 5).
 *
 * @module      auth-service/modules/auth
 */

import { randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { REDIS_KEYS, TTL } from '../../common/constants.js';
import { ArgonService } from '../../crypto/argon.service.js';
import { RedisService } from '../../redis/redis.service.js';

/** Résultat de génération d'un OTP. */
export interface IssueOtpResult {
  /** Code en clair (à transmettre au provider SMS, jamais loggé en prod). */
  code: string;
  /** TTL effectif en secondes. */
  ttlSeconds: number;
  /** `true` si l'OTP a été créé, `false` si un OTP valide existe déjà. */
  created: boolean;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly argon: ArgonService,
  ) {}

  /**
   * Émet un OTP register pour un téléphone. Si un OTP valide existe déjà,
   * on ne le remplace pas (`created=false`) — l'utilisateur doit attendre
   * l'expiration ou retenter avec le précédent.
   */
  async issueRegisterOtp(phone: string): Promise<IssueOtpResult> {
    const code = this.generate6DigitCode();
    const hash = await this.argon.hash(code);
    const key = REDIS_KEYS.otpRegister(phone);
    const created = await this.redis.setNxEx(key, TTL.otpRegisterSeconds, hash);

    if (!created) {
      // OTP existant — on ne fuit pas son code (anti-bypass). On retourne
      // le TTL restant pour informer le client.
      const remaining = await this.redis.ttl(key);
      return { code, ttlSeconds: Math.max(remaining, 0), created: false };
    }
    return { code, ttlSeconds: TTL.otpRegisterSeconds, created: true };
  }

  /**
   * Vérifie un OTP register. Consume-on-success : la clé est supprimée
   * après une vérification réussie pour éviter les replays.
   */
  async verifyRegisterOtp(phone: string, submittedCode: string): Promise<boolean> {
    const key = REDIS_KEYS.otpRegister(phone);
    const stored = await this.redis.get(key);
    if (!stored) return false;

    const ok = await this.argon.verify(stored, submittedCode);
    if (ok) await this.redis.del(key);
    return ok;
  }

  private generate6DigitCode(): string {
    // `randomInt(min, max)` exclusif sur `max` ; on garantit 6 digits avec padStart.
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
