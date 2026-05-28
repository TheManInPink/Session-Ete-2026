/**
 * @file        jwks.service.ts
 * @description Cache du JWKS (clés publiques) qui sert à la vérification du QR.
 *              Fetch initial + cache Redis 24 h + cron rafraîchissement 6 h.
 *              En P0 le JWKS est exposé par `auth-service`
 *              (`/.well-known/jwks-qr.json`).
 *
 * @module      document-service/qr
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import type { JWK } from 'jose';
import type { Env } from '../config/env.schema';
import { REDIS_CLIENT } from '../redis/redis.module';

interface Jwks {
  keys: JWK[];
}

@Injectable()
export class JwksService {
  private readonly log = new Logger(JwksService.name);
  private readonly cacheKey = 'qr:jwks';
  private readonly url: string;

  constructor(
    cfg: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.url = cfg.get('JWKS_QR_URL', { infer: true });
  }

  /**
   * Retourne la JWK correspondant à `kid`. Lance si introuvable.
   */
  async getKey(kid: string): Promise<JWK> {
    const jwks = await this.fetchCached();
    const key = jwks.keys.find((k) => k.kid === kid);
    if (!key) throw new Error(`kid ${kid} not in JWKS`);
    return key;
  }

  /** Rafraîchit préventivement toutes les 6 h pour amortir le cold cache. */
  @Cron(CronExpression.EVERY_6_HOURS)
  async refresh(): Promise<void> {
    try {
      await this.redis.del(this.cacheKey);
      await this.fetchCached();
      this.log.log('JWKS rafraîchi (cron 6h)');
    } catch (err) {
      this.log.warn(`JWKS refresh failed: ${(err as Error).message}`);
    }
  }

  private async fetchCached(): Promise<Jwks> {
    const cached = await this.redis.get(this.cacheKey);
    if (cached) return JSON.parse(cached) as Jwks;

    const res = await fetch(this.url);
    if (!res.ok) {
      throw new Error(`JWKS fetch failed: HTTP ${res.status} @ ${this.url}`);
    }
    const jwks = (await res.json()) as Jwks;
    await this.redis.set(this.cacheKey, JSON.stringify(jwks), 'EX', 86_400); // 24 h
    return jwks;
  }
}
