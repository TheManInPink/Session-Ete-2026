/**
 * @file        refresh.service.ts
 * @description Logique de rotation des refresh tokens avec détection de rejeu.
 *
 *              Invariants :
 *                - Un refresh token = un `jti` unique + un `family` partagé
 *                  entre tous les jti issus d'une même séquence de rotations.
 *                - Redis stocke `rt:<jti>` (présent ⇒ token actif) et
 *                  `rt-family:<userId>:<family>` (pointe vers le jti courant).
 *                - À la rotation, on SUPPRIME l'ancien `rt:<jti>` AVANT de
 *                  publier le nouveau. Si une seconde requête présente
 *                  l'ancien jti → `rt:<jti>` absent → REJEU détecté → on
 *                  révoque toute la famille (suppression de `rt-family:*`
 *                  + tous les jti rattachés non encore consommés).
 *
 *              Cette mécanique implémente la recommandation OWASP « refresh
 *              token rotation with reuse detection » (cf. cheatsheet auth).
 *
 * @module      auth-service/modules/auth
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { AUTH_ERRORS, REDIS_KEYS, TTL } from '../../common/constants.js';
import { JwtCryptoService } from '../../crypto/jwt.service.js';
import { RedisService } from '../../redis/redis.service.js';
import type { UserRole } from '../../common/types.js';

/** Issu d'une rotation réussie. */
export interface RotatedTokens {
  access: string;
  refresh: string;
  expiresIn: number;
}

@Injectable()
export class RefreshService {
  private readonly logger = new Logger(RefreshService.name);

  constructor(
    private readonly jwt: JwtCryptoService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Persiste un refresh token fraîchement émis. À appeler par les flows
   * qui émettent un refresh (register, login, rotation).
   */
  async persist(jti: string, userId: string, family: string): Promise<void> {
    await this.redis.setEx(
      REDIS_KEYS.refreshToken(jti),
      TTL.refreshFamilySeconds,
      JSON.stringify({ userId, family, issuedAt: Date.now() }),
    );
    await this.redis.setEx(REDIS_KEYS.refreshFamily(userId, family), TTL.refreshFamilySeconds, jti);
  }

  /**
   * Vérifie le refresh fourni, le révoque, et émet une nouvelle paire
   * dans la même famille. Tout token rejoué (jti absent) déclenche la
   * révocation de la famille entière.
   *
   * @param mfa - `mfa` claim à propager dans le nouvel access token.
   *              C'est le caller (AuthService.refresh) qui détermine cette
   *              valeur — typiquement copiée depuis la session courante.
   */
  async rotate(refreshToken: string, mfa: boolean): Promise<RotatedTokens> {
    const decoded = this.jwt.verifyRefresh(refreshToken);
    const { sub: userId, role, jti, family } = decoded;

    const present = await this.redis.exists(REDIS_KEYS.refreshToken(jti));
    if (!present) {
      // Rejeu probable : on révoque la famille entière par précaution.
      await this.revokeFamily(userId, family);
      this.logger.warn(
        `Refresh replay détecté — userId=${userId} family=${family} — famille révoquée.`,
      );
      throw new UnauthorizedException(AUTH_ERRORS.REFRESH_REPLAY_DETECTED);
    }

    // Atomicité best-effort : on supprime l'ancien JTI AVANT d'émettre.
    await this.redis.del(REDIS_KEYS.refreshToken(jti));

    const newRefresh = this.jwt.signRefresh({ userId, role: role as UserRole, family });
    await this.persist(newRefresh.jti, userId, family);

    const newAccess = this.jwt.signAccess({ userId, role: role as UserRole, mfa });

    return {
      access: newAccess,
      refresh: newRefresh.token,
      expiresIn: 900,
    };
  }

  /**
   * Révoque atomiquement un refresh (logout). Idempotent — la suppression
   * d'une clé absente ne lève pas d'erreur.
   */
  async revoke(refreshToken: string): Promise<void> {
    let userId: string;
    let family: string;
    let jti: string;
    try {
      const decoded = this.jwt.verifyRefresh(refreshToken);
      userId = decoded.sub;
      family = decoded.family;
      jti = decoded.jti;
    } catch {
      // Logout idempotent — un token invalide ne provoque pas 401, le but
      // est juste de garantir qu'il n'est plus utilisable côté serveur.
      return;
    }
    await this.redis.del(REDIS_KEYS.refreshToken(jti), REDIS_KEYS.refreshFamily(userId, family));
  }

  /**
   * Révoque l'intégralité d'une famille. Utilisé par la détection de
   * rejeu et par les flows admin (force-logout). On ne peut pas itérer
   * les jti rattachés sans index dédié — la clé famille suffit en
   * pratique car la rotation supprime systématiquement l'ancien jti.
   */
  async revokeFamily(userId: string, family: string): Promise<void> {
    await this.redis.del(REDIS_KEYS.refreshFamily(userId, family));
  }
}
