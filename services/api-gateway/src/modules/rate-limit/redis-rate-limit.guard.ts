/**
 * @file        redis-rate-limit.guard.ts
 * @description Guard GLOBAL de rate limiting distribué (responsabilité n°3 :
 *              « Rate limiting global ET par utilisateur, Redis-backed »).
 *
 *              FENÊTRE FIXE par identité : on dérive une clé
 *              `rl:<identité>:<début-de-fenêtre>` et on l'incrémente atomiquement.
 *              L'identité est l'`userId` authentifié si présent (le guard
 *              d'auth s'exécute AVANT et a renseigné `req.gatewayUser`), sinon
 *              l'IP source. Ainsi un même utilisateur derrière un NAT partagé
 *              n'est pas pénalisé par ses voisins, et un anonyme est limité par IP.
 *
 *              FAIL-OPEN : si Redis est indisponible, on laisse passer. Le rate
 *              limiting est une protection best-effort, pas un contrôle dur ; il
 *              ne doit jamais provoquer un déni de service auto-infligé.
 *
 *              POURQUOI APRÈS le guard d'auth : pour disposer de l'`userId`. Les
 *              deux guards sont enregistrés dans cet ordre dans AppModule.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/rate-limit
 */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';
import type { Env } from '../../config/env.schema.js';
import type { GatewayRequest } from '../../auth/gateway-request.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  private readonly enabled: boolean;
  private readonly windowSec: number;
  private readonly max: number;

  constructor(
    private readonly redis: RedisService,
    cfg: ConfigService<Env, true>,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {
    this.enabled = cfg.get('RATE_LIMIT_ENABLED', { infer: true });
    this.windowSec = cfg.get('RATE_LIMIT_WINDOW_SEC', { infer: true });
    this.max = cfg.get('RATE_LIMIT_MAX', { infer: true });
  }

  /**
   * Compte la requête courante dans la fenêtre et autorise/refuse.
   *
   * @returns `true` si sous le quota (ou Redis indisponible — fail-open).
   * @throws HttpException(429, E_GW_RATELIMIT) si le quota est dépassé.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;

    const req = context.switchToHttp().getRequest<GatewayRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    const identity = this.identityOf(req);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % this.windowSec);
    const resetAt = windowStart + this.windowSec;
    const key = `rl:${identity}:${windowStart}`;

    const count = await this.redis.incrementWindow(key, this.windowSec);

    // Redis KO → fail-open : on n'oppose aucune limite.
    if (count === null) return true;

    const remaining = Math.max(0, this.max - count);
    res.setHeader('X-RateLimit-Limit', String(this.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetAt));

    if (count > this.max) {
      const retryAfter = Math.max(1, resetAt - now);
      res.setHeader('Retry-After', String(retryAfter));
      this.logger.warn({ identity, count, max: this.max }, 'Quota de rate limiting dépassé');
      throw new HttpException(
        {
          code: 'E_GW_RATELIMIT',
          message: 'Trop de requêtes — réessayez plus tard',
          details: { retryAfter },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Dérive l'identité de rate limiting : utilisateur authentifié si connu,
   * sinon IP source (premier hop de `X-Forwarded-For`, sinon `req.ip`).
   */
  private identityOf(req: GatewayRequest): string {
    if (req.gatewayUser?.userId) return `u:${req.gatewayUser.userId}`;
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    const ip = xffStr?.split(',')[0]?.trim() || req.ip || 'unknown';
    return `ip:${ip}`;
  }
}
