import { RevocationService } from '../../src/qr/revocation.service';

interface FakeRedis {
  store: Map<string, { value: string; expiresAt: number | null }>;
  set: jest.Mock;
  exists: jest.Mock;
}

function makeFakeRedis(): FakeRedis {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  const set = jest.fn(async (key: string, value: string, _mode: string, ttlSec: number) => {
    store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
    return 'OK';
  });
  const exists = jest.fn(async (key: string) => {
    const entry = store.get(key);
    if (!entry) return 0;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      store.delete(key);
      return 0;
    }
    return 1;
  });
  return { store, set, exists };
}

describe('RevocationService', () => {
  let redis: FakeRedis;
  let svc: RevocationService;

  beforeEach(() => {
    redis = makeFakeRedis();
    svc = new RevocationService(redis as never);
  });

  it('add(jti, exp) écrit avec TTL aligné sur (exp - now)', async () => {
    const exp = new Date(Date.now() + 3600_000); // +1h
    await svc.add('jti-1', exp);
    expect(redis.set).toHaveBeenCalledWith('qr:rev:jti-1', '1', 'EX', expect.any(Number));
    const ttl = redis.set.mock.calls[0]![3] as number;
    expect(ttl).toBeGreaterThan(3500);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it('isRevoked renvoie true uniquement après add', async () => {
    expect(await svc.isRevoked('jti-2')).toBe(false);
    await svc.add('jti-2', new Date(Date.now() + 60_000));
    expect(await svc.isRevoked('jti-2')).toBe(true);
  });

  it('TTL minimum 60s même si exp est déjà passé', async () => {
    await svc.add('jti-3', new Date(Date.now() - 1000));
    const ttl = redis.set.mock.calls[0]![3] as number;
    expect(ttl).toBe(60);
  });
});
