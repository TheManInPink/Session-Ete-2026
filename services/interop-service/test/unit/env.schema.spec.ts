/**
 * @file        env.schema.spec.ts
 * @description Tests du durcissement de configuration : défauts sûrs en dev,
 *              REFUS de boot en production si l'identité-par-cert mTLS est
 *              désactivée ou si la simulation dev est laissée active.
 * @module      interop-service/test
 */
import { validateEnv } from '../../src/config/env.schema.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('validateEnv (interop-service)', () => {
  it('applique des défauts sûrs en dev (MLI, ingress trusted, quota 1000)', () => {
    const env = validateEnv({ ...base });
    expect(env.INTEROP_SELF_COUNTRY).toBe('MLI');
    expect(env.INTEROP_TRUST_INGRESS_HEADERS).toBe(true);
    expect(env.INTEROP_RATE_LIMIT_PER_COUNTRY).toBe(1000);
    expect(env.INTEROP_SERVICE_PORT).toBe(3006);
  });

  it('échoue si DATABASE_URL absent (fail-fast)', () => {
    expect(() => validateEnv({})).toThrow(/Configuration invalide/);
  });

  it('PROD : refuse INTEROP_TRUST_INGRESS_HEADERS=false (identité-par-cert requise)', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', INTEROP_TRUST_INGRESS_HEADERS: 'false' }),
    ).toThrow(/PRODUCTION non sécurisée/);
  });

  it('PROD : refuse la simulation dev INTEROP_DEV_PEER_*', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        INTEROP_DEV_PEER_COUNTRY: 'BFA',
        INTEROP_DEV_PEER_FINGERPRINT: 'a'.repeat(64),
      }),
    ).toThrow(/PRODUCTION non sécurisée/);
  });

  it('PROD : configuration saine (ingress trusted, pas de simulation) → OK', () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: 'production',
      INTEROP_TRUST_INGRESS_HEADERS: 'true',
    });
    expect(env.NODE_ENV).toBe('production');
  });
});
