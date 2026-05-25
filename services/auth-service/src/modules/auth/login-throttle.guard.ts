/**
 * @file        login-throttle.guard.ts
 * @description Garde de rate-limit pour `POST /auth/login` — OWASP ASVS V11.1.
 *
 *              Politique : `THROTTLE_LOGIN_LIMIT` (5) tentatives par
 *              fenêtre `THROTTLE_LOGIN_TTL_SECONDS` (900 s) et par IP.
 *
 *              Stratégie « increment-first » :
 *                1. La requête incrémente immédiatement le compteur.
 *                2. Si le compteur dépasse la limite, on rejette 429.
 *                3. Le service efface la clé sur login réussi (reset).
 *
 *              Avantage vs « check-then-increment » : pas de course entre
 *              plusieurs requêtes concurrentes qui pourraient toutes
 *              passer juste avant que le compteur n'atteigne la limite.
 *
 *              Le compteur n'utilise PAS le TTL glissant (la fenêtre est
 *              fixée à la première tentative — cf. `RedisService.incrEx`).
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
export class LoginThrottleGuard implements CanActivate {
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
    const key = REDIS_KEYS.throttleLogin(ip);
    const ttl = this.config.get('THROTTLE_LOGIN_TTL_SECONDS', { infer: true });
    const limit = this.config.get('THROTTLE_LOGIN_LIMIT', { infer: true });

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
   * Extrait une IP exploitable. Honore `X-Forwarded-For` (premier élément)
   * — à n'activer que derrière un reverse-proxy de confiance (cf. ADR à
   * venir sur la configuration `trust proxy` Express).
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
