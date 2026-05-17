/**
 * @file        client.test.ts
 * @description Tests unitaires VaultClient (mock fetch).
 */

import { VaultClient } from '../index.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
});

function mockFetch(handlers: Record<string, (init: RequestInit) => Response>): jest.Mock {
  return jest.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const key = `${init.method ?? 'GET'} ${url.pathname}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Mock manquant pour ${key}`);
    return handler(init);
  });
}

describe('VaultClient', () => {
  describe('login()', () => {
    it('avec method=token, fetch /auth/token/lookup-self', async () => {
      globalThis.fetch = mockFetch({
        'GET /v1/auth/token/lookup-self': () =>
          new Response(JSON.stringify({ data: { ttl: 1800 } }), { status: 200 }),
      });

      const c = new VaultClient({
        endpoint: 'http://vault:8200',
        auth: { method: 'token', token: 'nina-dev' },
        logLevel: 'none',
      });
      await expect(c.login()).resolves.toBeUndefined();
    });

    it('avec method=approle, POST /auth/approle/login', async () => {
      globalThis.fetch = mockFetch({
        'POST /v1/auth/approle/login': () =>
          new Response(JSON.stringify({ auth: { client_token: 'rt.xxx', lease_duration: 3600 } }), {
            status: 200,
          }),
      });

      const c = new VaultClient({
        endpoint: 'http://vault:8200',
        auth: { method: 'approle', roleId: 'r1', secretId: 's1' },
        autoRenew: false,
        logLevel: 'none',
      });
      await c.login();
    });
  });

  describe('getSecret() avec cache', () => {
    it('retourne la valeur et hit le cache à la 2ᵉ requête', async () => {
      const fetchMock = mockFetch({
        'GET /v1/auth/token/lookup-self': () =>
          new Response(JSON.stringify({ data: { ttl: 1800 } })),
        'GET /v1/kv/data/database/identity-service': () =>
          new Response(
            JSON.stringify({
              data: { data: { url: 'postgresql://nina_admin:secret@db:5432/nina_aes_db' } },
            }),
          ),
      });
      globalThis.fetch = fetchMock;

      const c = new VaultClient({
        endpoint: 'http://vault:8200',
        auth: { method: 'token', token: 'nina-dev' },
        autoRenew: false,
        logLevel: 'none',
      });
      await c.login();

      const r1 = await c.getSecret<{ url: string }>('database/identity-service');
      const r2 = await c.getSecret<{ url: string }>('database/identity-service');

      expect(r1.url).toContain('postgresql://');
      expect(r2.url).toBe(r1.url);
      // Login (1) + getSecret#1 (1) — getSecret#2 doit hit le cache
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('transitSign() / transitVerify()', () => {
    it('signe puis vérifie un payload base64', async () => {
      const fetchMock = mockFetch({
        'GET /v1/auth/token/lookup-self': () =>
          new Response(JSON.stringify({ data: { ttl: 1800 } })),
        'POST /v1/transit/sign/jwt-signing-rs256': () =>
          new Response(JSON.stringify({ data: { signature: 'vault:v1:abc', key_version: 1 } })),
        'POST /v1/transit/verify/jwt-signing-rs256': () =>
          new Response(JSON.stringify({ data: { valid: true } })),
      });
      globalThis.fetch = fetchMock;

      const c = new VaultClient({
        endpoint: 'http://vault:8200',
        auth: { method: 'token', token: 'nina-dev' },
        autoRenew: false,
        logLevel: 'none',
      });
      await c.login();

      const sig = await c.transitSign('jwt-signing-rs256', 'aGVsbG8=');
      expect(sig.signature).toMatch(/^vault:v\d+:/);
      const ok = await c.transitVerify('jwt-signing-rs256', 'aGVsbG8=', sig.signature);
      expect(ok).toBe(true);
    });
  });
});
