/**
 * @file        redis.service.ts
 * @description Wrapper minimal autour d'ioredis pour les besoins de
 *              identity-service : get/set JSON, invalidation par pattern.
 *
 *              Tolérant aux pannes : si Redis est down, les opérations
 *              lèvent une erreur que le caller doit attraper pour fallback
 *              non-cache (cf. RedisCacheInterceptor).
 *
 * @module      identity-service/infrastructure/redis
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly keyPrefix = process.env.REDIS_KEY_PREFIX ?? 'identity:';
  private client: Redis | null = null;

  onModuleInit(): void {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      reconnectOnError: () => true,
    });

    this.client.on('error', (err) => this.logger.warn(`Redis error : ${err.message}`));
    this.client.on('ready', () => this.logger.log('Redis connecté'));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  /** Récupère une valeur JSON parsée, ou null si absente. */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.client) return null;
    const raw = await this.client.get(this.fullKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** Stocke une valeur JSON avec un TTL en secondes. */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    await this.client.set(this.fullKey(key), JSON.stringify(value), 'EX', ttlSeconds);
  }

  /** Supprime une clé exacte. */
  async del(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(this.fullKey(key));
  }

  /**
   * Invalide toutes les clés correspondant au pattern (ex. 'citizens:*').
   * À utiliser après une mutation pour purger le cache des lectures stales.
   *
   * ⚠️ SCAN coûteux en O(n). Acceptable en V1 (< 100k clés). En V2,
   * passer à des tags Redis Streams ou une stratégie write-through.
   */
  async invalidate(pattern: string): Promise<number> {
    if (!this.client) return 0;
    const stream = this.client.scanStream({ match: this.fullKey(pattern), count: 100 });
    let count = 0;
    for await (const keys of stream) {
      if (keys.length > 0) {
        count += await this.client.del(...keys);
      }
    }
    if (count > 0) this.logger.debug(`Invalidated ${count} keys (pattern: ${pattern})`);
    return count;
  }

  /** Test rapide de connectivité (utilisé par /health). */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  private fullKey(key: string): string {
    return key.startsWith(this.keyPrefix) ? key : `${this.keyPrefix}${key}`;
  }
}
