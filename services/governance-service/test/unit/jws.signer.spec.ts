/**
 * @file        jws.signer.spec.ts
 * @description Tests du `JwsSigner` (DEV mode, sans Vault → paire RSA éphémère
 *              locale) : roundtrip sign→verify, refus strict d'un `alg != RS256`
 *              (confusion d'algorithme), refus d'un `kid` non concordant, rejet
 *              d'un message FORGÉ (signature invalide).
 * @module      governance-service/test
 */
jest.mock('@nina-aes/database', () => ({ prisma: {}, Prisma: {} }));
// `@nina-aes/vault-client` est ESM : on le neutralise pour le runtime CJS de Jest.
jest.mock('@nina-aes/vault-client', () => ({ VaultClient: class {} }));

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwsSigner } from '../../src/crypto/jws.signer.js';

function makeSigner(): JwsSigner {
  // NODE_ENV=test → pas de fail-fast prod ; vault=null → mode DEV éphémère.
  const cfg = { get: () => 'test' } as unknown as ConfigService<never, true>;
  return new JwsSigner(cfg, null);
}

const KID = 'sgogt-user-11111111-1111-1111-1111-111111111111';

describe('JwsSigner — signature/vérification RS256 (DEV)', () => {
  it('produit un JWS compact à 3 segments avec header RS256 + version de clé (kv)', async () => {
    const signer = makeSigner();
    const jws = await signer.sign({ a: 1, b: 'x' }, KID);
    const parts = jws.split('.');
    expect(parts).toHaveLength(3);
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(KID);
    // La version de clé est ÉPINGLÉE dans l'en-tête signé (anti-rotation).
    expect(header.kv).toBe(1);
  });

  it('REFUSE un JWS sans version de clé épinglée (kv absent → non-répudiation non robuste à la rotation)', async () => {
    const signer = makeSigner();
    const jws = await signer.sign({ x: 1 }, KID);
    const [, payload, sig] = jws.split('.');
    // En-tête valide SAUF qu'il omet `kv` (cas d'un JWS legacy non épinglé).
    const headerNoKv = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }),
      'utf8',
    ).toString('base64url');
    const forged = `${headerNoKv}.${payload}.${sig}`;
    await expect(signer.verify(forged, KID)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('vérifie un JWS qu’il a lui-même signé (roundtrip)', async () => {
    const signer = makeSigner();
    const jws = await signer.sign({ sender: 'u1', priority: 'HIGH' }, KID);
    await expect(signer.verify(jws, KID)).resolves.toBe(true);
  });

  it('REFUSE un JWS dont l’en-tête annonce alg=none (confusion d’algorithme)', async () => {
    const signer = makeSigner();
    const jws = await signer.sign({ x: 1 }, KID);
    const [, payload, sig] = jws.split('.');
    const forgedHeader = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID }),
      'utf8',
    ).toString('base64url');
    const forged = `${forgedHeader}.${payload}.${sig}`;
    await expect(signer.verify(forged, KID)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('REFUSE un JWS dont le kid ne correspond pas (incohérence identité/clé)', async () => {
    const signer = makeSigner();
    const jws = await signer.sign({ x: 1 }, KID);
    await expect(signer.verify(jws, 'sgogt-user-autre')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('REJETTE un message FORGÉ (payload altéré après signature → signature invalide)', async () => {
    const signer = makeSigner();
    const jws = await signer.sign({ amount: 100 }, KID);
    const [header, , sig] = jws.split('.');
    const tampered = Buffer.from(JSON.stringify({ amount: 999999 }), 'utf8').toString('base64url');
    const forged = `${header}.${tampered}.${sig}`;
    await expect(signer.verify(forged, KID)).resolves.toBe(false);
  });
});
