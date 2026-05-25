/**
 * @file        login-throttle.guard.spec.ts
 * @description Tests de {@link LoginThrottleGuard} — increment-first +
 *              fenêtre stricte (pas de sliding TTL).
 */

import { HttpException, type ExecutionContext } from '@nestjs/common';

import { LoginThrottleGuard } from './login-throttle.guard.js';

const stubConfig = () =>
  ({
    get(key: string) {
      const map: Record<string, number> = {
        THROTTLE_LOGIN_TTL_SECONDS: 900,
        THROTTLE_LOGIN_LIMIT: 5,
      };
      return map[key];
    },
  }) as never;

const memRedis = () => {
  const counts = new Map<string, number>();
  return {
    incrEx: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    ttl: jest.fn(async () => 600),
  };
};

const buildCtx = (ip = '203.0.113.1'): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers: {} }),
    }),
  }) as unknown as ExecutionContext;

describe('LoginThrottleGuard', () => {
  it("autorise jusqu'à la limite (1..5)", async () => {
    const redis = memRedis();
    const guard = new LoginThrottleGuard(redis as never, stubConfig());

    for (let i = 0; i < 5; i += 1) {
      await expect(guard.canActivate(buildCtx())).resolves.toBe(true);
    }
    expect(redis.incrEx).toHaveBeenCalledTimes(5);
  });

  it('rejette 429 au-delà de la limite', async () => {
    const redis = memRedis();
    const guard = new LoginThrottleGuard(redis as never, stubConfig());

    for (let i = 0; i < 5; i += 1) await guard.canActivate(buildCtx());

    await expect(guard.canActivate(buildCtx())).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(buildCtx())).rejects.toMatchObject({
      response: { code: 'AUTH_TOO_MANY_ATTEMPTS' },
    });
  });

  it('compte indépendamment par IP', async () => {
    const redis = memRedis();
    const guard = new LoginThrottleGuard(redis as never, stubConfig());

    // 5 tentatives IP A → exhaust
    for (let i = 0; i < 5; i += 1) await guard.canActivate(buildCtx('203.0.113.1'));
    // 6e sur IP A → 429
    await expect(guard.canActivate(buildCtx('203.0.113.1'))).rejects.toBeInstanceOf(HttpException);
    // IP B est intacte
    await expect(guard.canActivate(buildCtx('203.0.113.2'))).resolves.toBe(true);
  });

  it('extrait X-Forwarded-For en priorité', async () => {
    const redis = memRedis();
    const guard = new LoginThrottleGuard(redis as never, stubConfig());

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '10.0.0.1',
          headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.1' },
        }),
      }),
    } as unknown as ExecutionContext;

    await guard.canActivate(ctx);
    expect(redis.incrEx).toHaveBeenCalledWith(expect.stringContaining('198.51.100.42'), 900);
  });
});
