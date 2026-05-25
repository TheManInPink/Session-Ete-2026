/**
 * @file        argon.service.spec.ts
 * @description Tests unitaires de {@link ArgonService}.
 *
 *              Vérifie le contrat haut niveau : hash + verify roundtrip,
 *              verify retourne false sur mismatch, `needsRehash` est un booléen.
 *              On NE teste PAS les paramètres argon2 internes (ce serait
 *              tester argon2 lui-même, hors scope).
 *
 *              `tc = 2 / memory = 19_456` rendent un hash ~50 ms — acceptable
 *              pour un test unitaire.
 */

import type { ConfigService } from '@nestjs/config';

import { ArgonService } from './argon.service.js';

const stubConfig = (): ConfigService =>
  ({
    get(key: string) {
      const map: Record<string, number> = {
        ARGON2_MEMORY_KIB: 19_456,
        ARGON2_ITERATIONS: 2,
        ARGON2_PARALLELISM: 1,
      };
      return map[key];
    },
  }) as unknown as ConfigService;

describe('ArgonService', () => {
  const service = new ArgonService(stubConfig() as never);

  it('hash + verify : roundtrip OK', async () => {
    const plain = 'CorrectHorseBatteryStaple!1';
    const hash = await service.hash(plain);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify(hash, plain)).resolves.toBe(true);
  });

  it('verify : mismatch retourne false (sans lever)', async () => {
    const hash = await service.hash('one-secret');
    await expect(service.verify(hash, 'another-secret')).resolves.toBe(false);
  });

  it('verify : hash malformé retourne false (anti-oracle)', async () => {
    await expect(service.verify('not-a-real-hash', 'whatever')).resolves.toBe(false);
  });

  it('hash : deux appels produisent des hashes différents (sels distincts)', async () => {
    const a = await service.hash('same-input');
    const b = await service.hash('same-input');
    expect(a).not.toBe(b);
  });

  it('needsRehash : retourne un booléen', async () => {
    const hash = await service.hash('x');
    expect(typeof service.needsRehash(hash)).toBe('boolean');
  });
});
