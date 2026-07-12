/**
 * @file        keycloak-token.verifier.spec.ts
 * @description Tests de {@link KeycloakTokenVerifier} — un access token Keycloak
 *              n'est accepté QUE si signature / iss / azp / typ / exp sont valides.
 *              Une vraie paire RSA est générée à la volée (aucune dépendance réseau
 *              ni Keycloak) ; le JWKS et la config sont stubbés.
 */

import { generateKeyPairSync } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

import { KeycloakTokenVerifier } from './keycloak-token.verifier.js';

const KID = 'kc-test-key-1';
const ISSUER = 'http://localhost:8080/realms/nina-aes';
const CLIENT = 'nina-citizen';

// Paire RSA « légitime » (celle publiée dans le JWKS stubbé).
const legit = generateKeyPairSync('rsa', { modulusLength: 2048 });
const legitPem = legit.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const jwkEntry = {
  ...legit.publicKey.export({ format: 'jwk' }),
  kid: KID,
  alg: 'RS256',
  use: 'sig',
};

// Paire « attaquant » : même KID annoncé, clé de signature différente.
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
const attackerPem = attacker.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

const configStub = (overrides: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    KEYCLOAK_ISSUER: ISSUER,
    KEYCLOAK_URL: 'http://localhost:8080',
    KEYCLOAK_REALM: 'nina-aes',
    KEYCLOAK_SSO_CLIENT_ID: CLIENT,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) };
};

const jwksStub = (keys: unknown[] = [jwkEntry]) => ({
  getKeycloakJwks: jest.fn().mockResolvedValue({ keys }),
});

const sign = (
  payload: Record<string, unknown>,
  opts: { key?: string; expiresIn?: number } = {},
): string => {
  const { key = legitPem, expiresIn = 300 } = opts;
  return jwt.sign(payload, key, { algorithm: 'RS256', keyid: KID, expiresIn });
};

const validPayload = { sub: 'kc-sub-123', iss: ISSUER, azp: CLIENT, typ: 'Bearer' };

const build = (cfg = configStub(), jwks = jwksStub()) =>
  new KeycloakTokenVerifier(cfg as never, jwks as never);

describe('KeycloakTokenVerifier', () => {
  it('accepte un access token Keycloak valide et renvoie le sub', async () => {
    await expect(build().verify(sign(validPayload))).resolves.toEqual({ sub: 'kc-sub-123' });
  });

  it('rejette une signature invalide (clé attaquant sous le même kid)', async () => {
    await expect(build().verify(sign(validPayload, { key: attackerPem }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejette un algorithme non-RS256 (confusion d'algorithme)", async () => {
    const token = jwt.sign(validPayload, 'shared-secret', {
      algorithm: 'HS256',
      keyid: KID,
      expiresIn: 300,
    });
    await expect(build().verify(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un mauvais issuer', async () => {
    await expect(
      build().verify(sign({ ...validPayload, iss: 'http://evil.example/realms/x' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un azp étranger (token émis pour un autre client)', async () => {
    await expect(
      build().verify(sign({ ...validPayload, azp: 'nina-admin' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un token expiré', async () => {
    await expect(build().verify(sign(validPayload, { expiresIn: -60 }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejette un id token (typ=ID)', async () => {
    await expect(build().verify(sign({ ...validPayload, typ: 'ID' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejette un kid absent du JWKS Keycloak', async () => {
    const verifier = build(configStub(), jwksStub([{ ...jwkEntry, kid: 'autre-kid' }]));
    await expect(verifier.verify(sign(validPayload))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("dérive l'issuer de KEYCLOAK_URL/REALM quand KEYCLOAK_ISSUER est absent", async () => {
    const verifier = build(configStub({ KEYCLOAK_ISSUER: undefined }));
    await expect(verifier.verify(sign(validPayload))).resolves.toEqual({ sub: 'kc-sub-123' });
  });
});
