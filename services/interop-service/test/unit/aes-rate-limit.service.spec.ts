/**
 * @file        aes-rate-limit.service.spec.ts
 * @description Tests négatifs du rate-limit BCID-AES (§5bis) : sous le quota →
 *              OK, 1001e requête → 429, panne Redis → fail-CLOSED (503).
 * @module      interop-service/test
 */
import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AesRateLimitService } from '../../src/throttle/aes-rate-limit.service.js';
import type { RedisService } from '../../src/infrastructure/redis/redis.service.js';
import { fakeConfig } from '../helpers/config.helper.js';

/** Faux RedisService : compteur glissant incrémental en mémoire, ou panne. */
function fakeRedis(opts: { down?: boolean } = {}): RedisService {
  const counters = new Map<string, number>();
  return {
    slidingWindowCount: async (key: string) => {
      if (opts.down) throw new Error('Redis down');
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
  } as unknown as RedisService;
}

describe('AesRateLimitService (tests négatifs §5bis)', () => {
  it('sous le quota → OK (aucune exception)', async () => {
    const svc = new AesRateLimitService(
      fakeConfig({ INTEROP_RATE_LIMIT_PER_COUNTRY: 3 }),
      fakeRedis(),
    );
    await expect(svc.enforce('BFA')).resolves.toBeUndefined();
    await expect(svc.enforce('BFA')).resolves.toBeUndefined();
    await expect(svc.enforce('BFA')).resolves.toBeUndefined();
  });

  it('quota dépassé (count > limit) → 429 TOO_MANY_REQUESTS', async () => {
    const svc = new AesRateLimitService(
      fakeConfig({ INTEROP_RATE_LIMIT_PER_COUNTRY: 2 }),
      fakeRedis(),
    );
    await svc.enforce('BFA'); // 1
    await svc.enforce('BFA'); // 2
    try {
      await svc.enforce('BFA'); // 3 > 2 → 429
      throw new Error('aurait dû lever 429');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('quotas par pays INDÉPENDANTS (BFA plein ≠ NER bloqué)', async () => {
    const svc = new AesRateLimitService(
      fakeConfig({ INTEROP_RATE_LIMIT_PER_COUNTRY: 1 }),
      fakeRedis(),
    );
    await svc.enforce('BFA');
    await expect(svc.enforce('NER')).resolves.toBeUndefined(); // NER a son propre compteur
  });

  it('FAIL-CLOSED : Redis down → 503 ServiceUnavailableException', async () => {
    const svc = new AesRateLimitService(fakeConfig(), fakeRedis({ down: true }));
    await expect(svc.enforce('BFA')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
