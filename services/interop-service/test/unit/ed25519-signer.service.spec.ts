/**
 * @file        ed25519-signer.service.spec.ts
 * @description Tests du signer JWS Ed25519 in-process (modèle de clé §4.2ter) :
 *              charge une clé depuis un faux Vault KV, signe un JWS avec les
 *              claims protégés exigés (jti/iat/nbf/exp/iss/aud), et vérifie le
 *              round-trip via la clé publique correspondante. Vérifie aussi le
 *              fallback clé éphémère (DEV) quand Vault est injoignable.
 * @module      interop-service/test
 */
import { exportJWK, generateKeyPair, importJWK, jwtVerify, type JWK } from 'jose';
import { Ed25519SignerService } from '../../src/keys/ed25519-signer.service.js';
import type { VaultClient } from '@nina-aes/vault-client';
import { fakeConfig } from '../helpers/config.helper.js';

/** Faux VaultClient renvoyant un secret donné, ou throw pour simuler une panne. */
function fakeVault(secret: Record<string, unknown> | null): VaultClient {
  return {
    getSecret: async () => {
      if (!secret) throw new Error('Vault down');
      return secret;
    },
  } as unknown as VaultClient;
}

describe('Ed25519SignerService', () => {
  it('charge une clé JWK depuis Vault KV et signe un JWS vérifiable (round-trip)', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const privJwk = await exportJWK(privateKey);
    privJwk.crv = 'Ed25519';
    privJwk.kty = 'OKP';
    const pubJwk = (await exportJWK(publicKey)) as JWK;
    pubJwk.crv = 'Ed25519';
    pubJwk.kty = 'OKP';

    const signer = new Ed25519SignerService(
      fakeConfig(),
      fakeVault({ private_jwk: privJwk, kid: 'mli-test' }),
    );
    await signer.onModuleInit();

    const jws = await signer.sign(
      { exists: true, valid: true, vulnerable: false, lastUpdated: '2026-04-15' },
      { jti: 'resp-1', iss: 'https://interop.nina-aes.ml', aud: 'aes:BFA', ttl: '5m' },
    );

    const key = await importJWK(pubJwk, 'EdDSA');
    const { payload, protectedHeader } = await jwtVerify(jws, key, {
      algorithms: ['EdDSA'],
      issuer: 'https://interop.nina-aes.ml',
      audience: 'aes:BFA',
    });
    expect(protectedHeader.alg).toBe('EdDSA');
    expect(protectedHeader.kid).toBe('mli-test');
    expect(payload.jti).toBe('resp-1');
    expect(payload.exists).toBe(true);
    expect(payload.nbf).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(signer.getKid()).toBe('mli-test');
  });

  it('Vault injoignable en dev → clé éphémère (signe quand même, kid=ephemeral-dev)', async () => {
    const signer = new Ed25519SignerService(fakeConfig({ NODE_ENV: 'test' }), fakeVault(null));
    await signer.onModuleInit();
    const jws = await signer.sign(
      { exists: false, valid: false, vulnerable: null, lastUpdated: null },
      { jti: 'resp-2', iss: 'https://interop.nina-aes.ml', aud: 'aes:NER', ttl: '5m' },
    );
    expect(jws.split('.')).toHaveLength(3);
    expect(signer.getKid()).toBe('ephemeral-dev');
  });

  it('Vault injoignable en PRODUCTION → refus (fail-fast, pas de clé éphémère)', async () => {
    const signer = new Ed25519SignerService(
      fakeConfig({ NODE_ENV: 'production' }),
      fakeVault(null),
    );
    await expect(signer.onModuleInit()).rejects.toThrow(/indisponible en production/);
  });
});
