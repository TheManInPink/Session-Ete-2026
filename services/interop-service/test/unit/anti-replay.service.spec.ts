/**
 * @file        anti-replay.service.spec.ts
 * @description Tests négatifs de l'anti-replay (§5bis) : 1er passage OK, replay
 *              du même jti rejeté (403), timestamp hors fenêtre rejeté (400),
 *              panne Redis → fail-CLOSED (503).
 * @module      interop-service/test
 */
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AntiReplayService } from '../../src/replay/anti-replay.service.js';
import type { RedisService } from '../../src/infrastructure/redis/redis.service.js';
import { fakeConfig } from '../helpers/config.helper.js';

/** Faux RedisService : SET NX en mémoire (Map), ou throw pour simuler une panne. */
function fakeRedis(opts: { down?: boolean } = {}): RedisService {
  const seen = new Set<string>();
  return {
    setReplayGuard: async (key: string) => {
      if (opts.down) throw new Error('Redis down');
      if (seen.has(key)) return false; // déjà vu
      seen.add(key);
      return true;
    },
  } as unknown as RedisService;
}

describe('AntiReplayService (tests négatifs §5bis)', () => {
  const now = () => new Date().toISOString();

  it('1er passage d un jti → OK (aucune exception)', async () => {
    const svc = new AntiReplayService(fakeConfig(), fakeRedis());
    await expect(svc.assertNotReplayed('jti-1', 'jti-1', now())).resolves.toBeUndefined();
  });

  it('REPLAY : même jti rejoué → 403 ForbiddenException', async () => {
    const svc = new AntiReplayService(fakeConfig(), fakeRedis());
    await svc.assertNotReplayed('jti-2', 'jti-2', now());
    await expect(svc.assertNotReplayed('jti-2', 'jti-2', now())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('timestamp hors fenêtre ±2 min (replay tardif) → 400 BadRequestException', async () => {
    const svc = new AntiReplayService(fakeConfig(), fakeRedis());
    const stale = new Date(Date.now() - 5 * 60_000).toISOString();
    await expect(svc.assertNotReplayed('jti-3', 'jti-3', stale)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('timestamp non parsable → 400 BadRequestException', async () => {
    const svc = new AntiReplayService(fakeConfig(), fakeRedis());
    await expect(svc.assertNotReplayed('jti-4', 'jti-4', 'not-a-date')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('FAIL-CLOSED : Redis down → 503 ServiceUnavailableException (ni accept, ni bypass)', async () => {
    const svc = new AntiReplayService(fakeConfig(), fakeRedis({ down: true }));
    await expect(svc.assertNotReplayed('jti-5', 'jti-5', now())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
