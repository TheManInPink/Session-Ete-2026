/**
 * @file        jws.service.spec.ts
 * @description Tests négatifs de la vérification JWS BCID-AES (§5bis) : JWS
 *              valide accepté, JWS forgé (clé inconnue) rejeté, alg confusion
 *              ("alg:none") rejetée, mauvais issuer/audience rejetés, incohérence
 *              requestId/jti et requesterCountry/cert rejetées.
 * @module      interop-service/test
 */
import { randomUUID } from 'node:crypto';
import { JwsService } from '../../src/bcid/jws.service.js';
import { fakeConfig } from '../helpers/config.helper.js';
import {
  baseRequest,
  forgeAlgNone,
  makeEd25519KeyPair,
  signRequestJws,
  type TestKeyPair,
} from '../helpers/jws.helper.js';

/** Construit un faux partenaire BFA avec la clé publique fournie. */
function bfaPartner(pub: TestKeyPair['publicJwk']) {
  return {
    id: 'p-bfa',
    country: 'BFA',
    certFingerprint: 'a'.repeat(64),
    publicKeyJwk: pub as object,
    kid: 'bfa-2026-q2',
    expectedIssuer: 'https://interop.dgec.bf',
    status: 'ACTIVE',
    validFrom: new Date(),
    validUntil: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    revokedReason: null,
    createdBy: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('JwsService — vérification JWS Ed25519 (tests négatifs §5bis)', () => {
  let svc: JwsService;
  let bfa: TestKeyPair;

  beforeAll(async () => {
    bfa = await makeEd25519KeyPair();
  });

  beforeEach(() => {
    svc = new JwsService(fakeConfig());
  });

  it('JWS valide (clé BFA enregistrée) → accepté, jti = requestId', async () => {
    const requestId = randomUUID();
    const jws = await signRequestJws(bfa.privateKey, baseRequest(requestId));
    const { request, jti } = await svc.verifyRequest(jws, bfaPartner(bfa.publicJwk));
    expect(jti).toBe(requestId);
    expect(request.requestId).toBe(requestId);
    expect(request.requesterCountry).toBe('BFA');
  });

  it('JWS forgé (signé par une clé inconnue) → rejeté (401)', async () => {
    const attacker = await makeEd25519KeyPair();
    const jws = await signRequestJws(attacker.privateKey, baseRequest(randomUUID()));
    // Le partenaire enregistre la clé BFA légitime, pas celle de l'attaquant.
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });

  it('alg confusion ("alg":"none") → rejeté', async () => {
    const jws = forgeAlgNone(baseRequest(randomUUID()));
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });

  it('mauvais issuer (iss ≠ émetteur enregistré) → rejeté', async () => {
    const jws = await signRequestJws(bfa.privateKey, baseRequest(randomUUID()), {
      iss: 'https://interop.evil.example',
    });
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });

  it('mauvaise audience (aud ≠ aes:MLI) → rejeté', async () => {
    const jws = await signRequestJws(bfa.privateKey, baseRequest(randomUUID()), {
      aud: 'aes:NER',
    });
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });

  it('nbf futur → rejeté par jwtVerify', async () => {
    const jws = await signRequestJws(bfa.privateKey, baseRequest(randomUUID()), { nbf: '+10m' });
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });

  it('exp dépassé → rejeté par jwtVerify', async () => {
    // exp dans le passé : jose accepte des durées négatives via une date absolue.
    const jws = await signRequestJws(bfa.privateKey, baseRequest(randomUUID()), {
      exp: '-10m',
    });
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });

  it('incohérence requestId/jti (jti ≠ requestId) → rejeté (400)', async () => {
    const payload = baseRequest(randomUUID());
    const jws = await signRequestJws(bfa.privateKey, payload, { jti: randomUUID() });
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });

  it('requesterCountry du payload ≠ pays du cert mTLS → rejeté (usurpation A01/A07)', async () => {
    const payload = { ...baseRequest(randomUUID()), requesterCountry: 'NER' };
    const jws = await signRequestJws(bfa.privateKey, payload);
    // Le cert mTLS dit BFA mais le payload prétend NER → rejet.
    await expect(svc.verifyRequest(jws, bfaPartner(bfa.publicJwk))).rejects.toThrow();
  });
});
