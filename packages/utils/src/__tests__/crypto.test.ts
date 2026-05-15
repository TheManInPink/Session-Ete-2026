/**
 * @file        crypto.test.ts
 * @description Tests Jest pour les primitives cryptographiques (RS256, Ed25519, biométrie).
 * @module      @nina-aes/utils
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  hashBiometric,
  signWithEd25519,
  signWithRS256,
  verifyEd25519,
  verifyRS256,
} from '../crypto';

describe('crypto — RS256', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  it('produit un JWT en 3 segments base64url', () => {
    const jwt = signWithRS256({ sub: 'nina-123' }, privateKey);
    expect(jwt.split('.')).toHaveLength(3);
    for (const seg of jwt.split('.')) {
      expect(seg).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('round-trip : signature puis vérification renvoie la charge utile', () => {
    const jwt = signWithRS256({ sub: 'nina-123', role: 'AGENT_CTDEC' }, privateKey, 60);
    const payload = verifyRS256(jwt, publicKey);
    expect(payload.sub).toBe('nina-123');
    expect(payload.role).toBe('AGENT_CTDEC');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
  });

  it('rejette une signature falsifiée', () => {
    const jwt = signWithRS256({ sub: 'a' }, privateKey);
    const tampered = jwt.slice(0, -2) + 'XX';
    expect(() => verifyRS256(tampered, publicKey)).toThrow();
  });

  it('rejette un JWT expiré', () => {
    const jwt = signWithRS256({ sub: 'a', exp: 1 }, privateKey); // exp dans le passé
    expect(() => verifyRS256(jwt, publicKey)).toThrow(/expir/i);
  });
});

describe('crypto — Ed25519', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  it('round-trip : signature acceptée par verifyEd25519', () => {
    const payload = { from: 'MLI', to: 'BFA', nina: '12345' };
    const sig = signWithEd25519(payload, privateKey);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifyEd25519(payload, sig, publicKey)).toBe(true);
  });

  it('rejette une charge modifiée', () => {
    const payload = { from: 'MLI', nina: '12345' };
    const sig = signWithEd25519(payload, privateKey);
    expect(verifyEd25519({ ...payload, nina: '67890' }, sig, publicKey)).toBe(false);
  });
});

describe('crypto — hashBiometric', () => {
  it('produit un digest SHA-256 hex de 64 caractères', () => {
    const tpl = randomBytes(512);
    const h = hashBiometric(tpl);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est stable pour le même template', () => {
    const tpl = randomBytes(256);
    expect(hashBiometric(tpl)).toBe(hashBiometric(tpl));
  });

  it('accepte un template encodé base64', () => {
    const tpl = randomBytes(64);
    expect(hashBiometric(tpl.toString('base64'))).toBe(hashBiometric(tpl));
  });
});
