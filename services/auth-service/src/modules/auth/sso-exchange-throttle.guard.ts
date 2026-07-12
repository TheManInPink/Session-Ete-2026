/**
 * @file        sso-exchange-throttle.guard.ts
 * @description Rate-limit de `POST /auth/sso/exchange` (ADR-036) — même
 *              stratégie « increment-first » que {@link LoginThrottleGuard},
 *              mais dans un ESPACE DE CLÉS DÉDIÉ (`throttle:sso-exchange:<ip>`)
 *              pour ne pas se coupler au compteur de login.
 *
 *              Politique : `THROTTLE_SSO_EXCHANGE_LIMIT` (10) requêtes par
 *              fenêtre `THROTTLE_SSO_EXCHANGE_TTL_SECONDS` (60 s) et par IP.
 *              L'échange exige déjà un token Keycloak signé (donc pas un oracle
 *              de credentials) : ce plafond borne surtout le débit de frappe de
 *              tokens en cas de token volé / de boucle défectueuse du portail.
 *
 * @module      auth-service/modules/auth
 */

import {
  CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUTH_ERRORS, REDIS_KEYS } from '../../common/constants.js';
import type { AppEnv } from '../../config/env.config.js';
import { RedisService } from '../../redis/redis.service.js';

@Injectable()
export class SsoExchangeThrottleGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      headers: Record<string, string | string[] | undefined>;
    }>();

    const ip = this.extractIp(request);
    const key = REDIS_KEYS.throttleSsoExchange(ip);
    const ttl = this.config.get('THROTTLE_SSO_EXCHANGE_TTL_SECONDS', { infer: true });
    const limit = this.config.get('THROTTLE_SSO_EXCHANGE_LIMIT', { infer: true });

    const count = await this.redis.incrEx(key, ttl);
    if (count > limit) {
      const remaining = await this.redis.ttl(key);
      throw new HttpException(
        {
          code: AUTH_ERRORS.TOO_MANY_ATTEMPTS,
          retryAfterSeconds: Math.max(remaining, 0),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /**
   * Extrait une IP exploitable. Honore `X-Forwarded-For` (premier élément) —
   * à n'activer que derrière un reverse-proxy de confiance (cf. LoginThrottleGuard).
   */
  private extractIp(req: {
    ip?: string;
    socket?: { remoteAddress?: string };
    headers: Record<string, string | string[] | undefined>;
  }): string {
    const xff = req.headers['x-forwarded-for'];
    const xffFirst = Array.isArray(xff) ? xff[0] : xff?.split(',')[0]?.trim();
    return xffFirst ?? req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
}
