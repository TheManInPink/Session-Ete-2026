/**
 * @file        consent.verifier.spec.ts
 * @description Tests de la CHAÎNE DE CONFIANCE du consentement (JWS Ed25519 ancré,
 *              CONSENT-PROTOCOL §4) :
 *                - JWS valide signé par la clé ANCRÉE du citoyen → accepté ;
 *                - `alg:none` / mauvais `typ` → 403 (liste blanche fermée) ;
 *                - `sub` != citizenId (anti-IDOR) → 403 ;
 *                - scope hors allow-list EXACTE (sous-chaîne) → 403 ;
 *                - `exp` dépassé → 403 ;
 *                - signature falsifiée / clé d'un AUTRE citoyen → 403 ;
 *                - rejeu (`jti` déjà vu en base) → 403.
 *              Le verifier utilise la clé DEV dérivée (NODE_ENV != production) ;
 *              on signe les JWS de test avec la MÊME dérivation (l'app du citoyen).
 * @module      biometric-service/test
 */
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as ed from '@noble/ed25519';

const findUnique = jest.fn();
jest.mock('@nina-aes/database', () => ({
  prisma: { biometricConsent: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { ConsentVerifier } from '../../src/consent/consent.verifier.js';
import { CitizenKeyringService } from '../../src/consent/citizen-keyring.service.js';
import type { Env } from '../../src/config/env.schema.js';

const CITIZEN = '11111111-1111-1111-1111-111111111111';
const AUD = 'nina-biometric-service';

const ENV: Partial<Record<keyof Env, unknown>> = {
  NODE_ENV: 'test',
  BIOMETRIC_CONSENT_AUDIENCE: AUD,
  BIOMETRIC_CONSENT_CLOCK_TOLERANCE_SEC: 60,
};
const cfg = { get: (k: keyof Env) => ENV[k] } as unknown as ConfigService<Env, true>;

const b64url = (buf: Uint8Array | string): string =>
  Buffer.from(buf as never).toString('base64url');

/** Construit + signe un JWS de consentement avec la clé DEV du citoyen. */
async function makeJws(opts: {
  citizenId: string;
  signerCitizenId?: string; // si différent, on signe avec une AUTRE clé
  alg?: string;
  typ?: string;
  sub?: string;
  scope?: string | string[];
  aud?: string;
  expDeltaSec?: number;
  jti?: string;
}): Promise<string> {
  const keyring = new CitizenKeyringService(cfg);
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: opts.alg ?? 'EdDSA',
    typ: opts.typ ?? 'nina-bio-consent+jws',
    kid: keyring.devKid(opts.citizenId),
  };
  const claims = {
    sub: opts.sub ?? opts.citizenId,
    iss: `cit:${opts.citizenId}`,
    intent: 'BIOMETRIC_CONSENT',
    scope: opts.scope ?? ['enroll:FINGERPRINT'],
    aud: opts.aud ?? AUD,
    channel: 'kiosk',
    lang: 'bm',
    iat: now,
    nbf: now,
    exp: now + (opts.expDeltaSec ?? 600),
    jti: opts.jti ?? 'jti-unique-1',
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const priv = await keyring.devCitizenPrivateKey(opts.signerCitizenId ?? opts.citizenId);
  const sig = await ed.signAsync(new TextEncoder().encode(signingInput), priv);
  return `${signingInput}.${b64url(sig)}`;
}

function verifier(): ConsentVerifier {
  return new ConsentVerifier(cfg, new CitizenKeyringService(cfg));
}

describe('ConsentVerifier — chaîne de confiance', () => {
  beforeEach(() => findUnique.mockResolvedValue(null)); // pas de rejeu par défaut

  it('JWS valide signé par la clé ANCRÉE → accepté', async () => {
    const jws = await makeJws({ citizenId: CITIZEN });
    const res = await verifier().verify(jws, CITIZEN);
    expect(res.scope).toBe('enroll:FINGERPRINT');
    expect(res.signerKid).toContain(CITIZEN);
    expect(res.jti).toBe('jti-unique-1');
  });

  it('alg:none → 403 (liste blanche fermée)', async () => {
    const jws = await makeJws({ citizenId: CITIZEN, alg: 'none' });
    await expect(verifier().verify(jws, CITIZEN)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mauvais typ → 403 (anti-confusion de jeton)', async () => {
    const jws = await makeJws({ citizenId: CITIZEN, typ: 'JWT' });
    await expect(verifier().verify(jws, CITIZEN)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sub != citizenId (anti-IDOR) → 403', async () => {
    const jws = await makeJws({ citizenId: CITIZEN, sub: 'autre-citoyen' });
    await expect(verifier().verify(jws, CITIZEN)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scope hors allow-list exacte (sous-chaîne) → 403', async () => {
    const jws = await makeJws({ citizenId: CITIZEN, scope: ['enroll:FINGERPRINT_EVIL'] });
    await expect(verifier().verify(jws, CITIZEN)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exp dépassé → 403', async () => {
    const jws = await makeJws({ citizenId: CITIZEN, expDeltaSec: -3600 });
    await expect(verifier().verify(jws, CITIZEN)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('signé par la clé d’un AUTRE citoyen (usurpation) → 403', async () => {
    // kid = clé du CITIZEN, mais signature produite avec la clé d'un autre.
    const jws = await makeJws({ citizenId: CITIZEN, signerCitizenId: 'fraudeur' });
    await expect(verifier().verify(jws, CITIZEN)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeu : jti déjà vu en base → 403', async () => {
    findUnique.mockResolvedValue({ revokedAt: null }); // jti déjà consommé
    const jws = await makeJws({ citizenId: CITIZEN });
    await expect(verifier().verify(jws, CITIZEN)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
