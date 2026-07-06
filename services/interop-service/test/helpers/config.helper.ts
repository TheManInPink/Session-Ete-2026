/**
 * @file        config.helper.ts
 * @description Faux ConfigService typé pour les tests (valeurs par défaut
 *              alignées sur env.schema). Aucune connexion réelle n'est ouverte.
 * @module      interop-service/test/helpers
 */
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.schema.js';

/** Valeurs par défaut de test (cohérentes avec le schéma Zod). */
const DEFAULTS: Record<string, unknown> = {
  NODE_ENV: 'test',
  INTEROP_SERVICE_PORT: 3006,
  INTEROP_SELF_COUNTRY: 'MLI',
  INTEROP_SELF_ISSUER: 'https://interop.nina-aes.ml',
  INTEROP_AUDIENCE_PREFIX: 'aes:',
  INTEROP_JWS_TTL: '5m',
  INTEROP_CLOCK_TOLERANCE_SEC: 120,
  REDIS_URL: 'redis://127.0.0.1:6379',
  REDIS_KEY_PREFIX: 'interop-test:',
  INTEROP_RATE_LIMIT_PER_COUNTRY: 1000,
  INTEROP_RATE_LIMIT_WINDOW_SEC: 3600,
  INTEROP_TRUST_INGRESS_HEADERS: true,
  INTEROP_MTLS_VERIFY_HEADER: 'ssl-client-verify',
  INTEROP_MTLS_CERT_HEADER: 'ssl-client-cert',
  INTEROP_SIGNING_KID: 'mli-2026-q2',
  VAULT_INTEROP_KEY_PATH: 'interop/signing-key',
  INTEROP_OUTGOING_TIMEOUT_MS: 8000,
  INTEROP_PARTNER_ENDPOINTS: '',
  AUTH_JWKS_URL: 'http://localhost:3002/.well-known/jwks.json',
};

/** Construit un faux ConfigService surchargeable par `overrides`. */
export function fakeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const merged = { ...DEFAULTS, ...overrides };
  return {
    get: (key: string) => merged[key],
  } as unknown as ConfigService<Env, true>;
}
