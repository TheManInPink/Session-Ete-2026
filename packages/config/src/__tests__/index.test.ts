/**
 * @file        index.test.ts
 * @description Tests Jest pour le schéma de validation des variables d'environnement.
 * @module      @nina-aes/config
 */

import { envSchema, validateEnv } from '../index';

describe('envSchema — validation par défaut', () => {
  it('accepte un environnement vide (toutes les valeurs ont des défauts dev)', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('renseigne tous les champs attendus avec leurs valeurs par défaut', () => {
    const env = validateEnv(envSchema, {});
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_EXPIRATION).toBe('15m');
    expect(env.JWT_REFRESH_EXPIRATION).toBe('7d');
    expect(env.MINIO_BUCKET).toBe('nina-documents');
    expect(env.PROMETHEUS_PORT).toBe(9090);
    expect(env.JAEGER_ENDPOINT).toMatch(/^http/);
    expect(env.AES_MLI_CERT_PATH).toMatch(/mli\.pem$/);
  });
});

describe('envSchema — rejets', () => {
  it('rejette un NODE_ENV inconnu', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'qa' });
    expect(result.success).toBe(false);
  });

  it('rejette un JWT_SECRET trop court', () => {
    const result = envSchema.safeParse({ JWT_SECRET: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejette un format d’expiration invalide', () => {
    const result = envSchema.safeParse({ JWT_ACCESS_EXPIRATION: '15 minutes' });
    expect(result.success).toBe(false);
  });

  it('rejette un PROMETHEUS_PORT non numérique', () => {
    const result = envSchema.safeParse({ PROMETHEUS_PORT: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejette une URL Vault malformée', () => {
    const result = envSchema.safeParse({ VAULT_ADDR: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('validateEnv — message d’erreur', () => {
  it('inclut le chemin de chaque champ invalide', () => {
    expect(() =>
      validateEnv(envSchema, { JWT_SECRET: 'x', VAULT_ADDR: 'nope' }),
    ).toThrow(/JWT_SECRET[\s\S]+VAULT_ADDR/);
  });
});

describe('envSchema — coercition numérique', () => {
  it('coerce les ports passés en chaîne', () => {
    const env = validateEnv(envSchema, {
      API_GATEWAY_PORT: '4000',
      MINIO_PORT: '9001',
      PROMETHEUS_PORT: '9999',
    });
    expect(env.API_GATEWAY_PORT).toBe(4000);
    expect(env.MINIO_PORT).toBe(9001);
    expect(env.PROMETHEUS_PORT).toBe(9999);
  });
});
