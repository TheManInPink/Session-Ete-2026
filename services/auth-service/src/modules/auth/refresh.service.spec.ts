/**
 * @file        refresh.service.spec.ts
 * @description Tests de {@link RefreshService} — focus sur l'invariant
 *              critique : rotation + détection de rejeu.
 *
 *              JwtCryptoService est stubbé pour ne pas dépendre de Vault
 *              (chargement de clés réel). Le Redis est en mémoire.
 */

import { UnauthorizedException } from '@nestjs/common';

import { UserRole } from '../../common/types.js';

import { RefreshService } from './refresh.service.js';

const memRedis = () => {
  const map = new Map<string, string>();
  return {
    setEx: jest.fn(async (k: string, _ttl: number, v: string) => {
      map.set(k, v);
    }),
    get: jest.fn(async (k: string) => map.get(k) ?? null),
    del: jest.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (map.delete(k)) n += 1;
      return n;
    }),
    exists: jest.fn(async (k: string) => map.has(k)),
  };
};

const stubJwt = () => {
  let counter = 0;
  return {
    verifyRefresh: jest.fn((token: string) => {
      // Format token de test : "tok:<userId>:<role>:<jti>:<family>"
      const [, userId, role, jti, family] = token.split(':');
      if (!userId || !role || !jti || !family) {
        throw new UnauthorizedException('AUTH_TOKEN_INVALID');
      }
      return { sub: userId, role, jti, family };
    }),
    signRefresh: jest.fn((input: { userId: string; role: UserRole; family?: string }) => {
      counter += 1;
      const jti = `jti${counter}`;
      const family = input.family ?? `fam${counter}`;
      return {
        token: `tok:${input.userId}:${input.role}:${jti}:${family}`,
        jti,
        family,
        expiresAt: Date.now() + 604_800_000,
      };
    }),
    signAccess: jest.fn(() => 'access-token-stub'),
  };
};

describe('RefreshService', () => {
  it('persist + rotate : émet un nouveau jti dans la même famille', async () => {
    const redis = memRedis();
    const jwt = stubJwt();
    const svc = new RefreshService(jwt as never, redis as never);

    await svc.persist('jti0', 'user-1', 'fam0');
    const initialToken = `tok:user-1:${UserRole.AGENT}:jti0:fam0`;

    const rotated = await svc.rotate(initialToken, /* mfa */ true);

    expect(rotated.access).toBe('access-token-stub');
    expect(rotated.refresh).toMatch(/^tok:user-1:agent:jti\d+:fam0$/);
    // L'ancien jti doit avoir été supprimé.
    expect(await redis.exists('rt:jti0')).toBe(false);
  });

  it("rotate : rejeu d'un jti déjà consommé révoque la famille", async () => {
    const redis = memRedis();
    const jwt = stubJwt();
    const svc = new RefreshService(jwt as never, redis as never);

    await svc.persist('jti0', 'user-1', 'fam0');
    const initialToken = `tok:user-1:${UserRole.AGENT}:jti0:fam0`;

    // 1ère rotation OK.
    await svc.rotate(initialToken, true);

    // 2e rotation avec le même token → REPLAY.
    await expect(svc.rotate(initialToken, true)).rejects.toThrow(/AUTH_REFRESH_REPLAY_DETECTED/);
    // La famille a été révoquée.
    expect(await redis.exists('rt-family:user-1:fam0')).toBe(false);
  });

  it('revoke : idempotent + token invalide ne lève pas', async () => {
    const redis = memRedis();
    const jwt = stubJwt();
    const svc = new RefreshService(jwt as never, redis as never);

    await svc.persist('jtiX', 'user-1', 'famX');
    const token = `tok:user-1:${UserRole.AGENT}:jtiX:famX`;

    await svc.revoke(token);
    expect(await redis.exists('rt:jtiX')).toBe(false);

    // 2e appel sur clé déjà supprimée → no-op.
    await expect(svc.revoke(token)).resolves.toBeUndefined();
    // Token bidon → silencieux.
    await expect(svc.revoke('bogus')).resolves.toBeUndefined();
  });
});
