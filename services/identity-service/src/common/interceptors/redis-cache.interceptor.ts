/**
 * @file        redis-cache.interceptor.ts
 * @description Interceptor de cache Redis par endpoint, scopé par url+query+user.
 *              Décoration via `@CacheKey('citizens:byNina')` + `@CacheTtl(300)`.
 *
 *              Cache uniquement sur GET, jamais sur POST/PUT/DELETE.
 *              Clé : `<prefix>:<route-key>:<sha1(url+user)>`.
 *
 *              ⚠️ N'utiliser que pour des données peu volatiles ou avec un
 *              mécanisme d'invalidation explicite (cf. CitizenService.update
 *              qui appelle `redis.invalidate('citizens:*')`).
 *
 * @module      identity-service/common
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { createHash } from 'node:crypto';
import type { Request } from 'express';

import { RedisService } from '../../infrastructure/redis/redis.service';

export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';

/** Définit la clé logique du cache pour une route (ex. 'citizens:byNina'). */
export const CacheKey = (key: string): MethodDecorator => SetMetadata(CACHE_KEY_METADATA, key);

/** Définit le TTL en secondes (défaut 300). */
export const CacheTtl = (seconds: number): MethodDecorator =>
  SetMetadata(CACHE_TTL_METADATA, seconds);

@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RedisCacheInterceptor.name);
  private readonly defaultTtl = Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 300);

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<Request>();

    // Ne cacher que GET (idempotent)
    if (req.method !== 'GET') return next.handle();

    const handler = ctx.getHandler();
    const keyPrefix = this.reflector.get<string>(CACHE_KEY_METADATA, handler);
    if (!keyPrefix) return next.handle();

    const ttl = this.reflector.get<number>(CACHE_TTL_METADATA, handler) ?? this.defaultTtl;
    const fingerprint = createHash('sha1')
      .update(req.originalUrl)
      .update((req.headers.authorization ?? '').slice(-32)) // dernier 32 chars pour scope user
      .digest('hex')
      .slice(0, 16);

    const cacheKey = `${keyPrefix}:${fingerprint}`;

    try {
      const cached = await this.redis.get<unknown>(cacheKey);
      if (cached !== null) {
        this.logger.debug(`Cache HIT ${cacheKey}`);
        return of(cached);
      }
    } catch (err) {
      // Redis indisponible → fallback non-cache
      this.logger.warn(`Redis indisponible pour ${cacheKey} — fallback DB`, err as Error);
    }

    return next.handle().pipe(
      tap(async (data) => {
        try {
          await this.redis.set(cacheKey, data, ttl);
        } catch (err) {
          this.logger.warn(`Redis SET échoué pour ${cacheKey}`, err as Error);
        }
      }),
    );
  }
}
