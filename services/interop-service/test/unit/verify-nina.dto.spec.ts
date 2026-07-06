/**
 * @file        verify-nina.dto.spec.ts
 * @description Tests des schémas Zod BCID-AES : requête minimaliste (NINA,
 *              pays, finalité, requestId UUID, timestamp ISO) et réponse
 *              minimaliste (privacy by design : pas de champ identitaire).
 * @module      interop-service/test
 */
import { randomUUID } from 'node:crypto';
import {
  VerifyNinaRequestSchema,
  VerifyNinaResponseSchema,
} from '../../src/bcid/dto/verify-nina.dto.js';

describe('VerifyNinaRequestSchema', () => {
  const valid = () => ({
    nina: '18903102015042V',
    requesterCountry: 'BFA',
    purpose: 'border-control',
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
  });

  it('accepte une requête valide et STRIPPE les claims JWS techniques', () => {
    const withJwsClaims = { ...valid(), iat: 1, nbf: 1, exp: 2, iss: 'x', aud: 'y', jti: 'z' };
    const parsed = VerifyNinaRequestSchema.parse(withJwsClaims);
    expect(parsed).not.toHaveProperty('iat');
    expect(parsed).not.toHaveProperty('jti');
    expect(parsed.nina).toBe('18903102015042V');
  });

  it('rejette un NINA mal formé', () => {
    expect(VerifyNinaRequestSchema.safeParse({ ...valid(), nina: 'ABC' }).success).toBe(false);
  });

  it('rejette une finalité hors enum (purpose limitation RGPD)', () => {
    expect(VerifyNinaRequestSchema.safeParse({ ...valid(), purpose: 'spying' }).success).toBe(
      false,
    );
  });

  it('rejette un pays hors AES', () => {
    expect(VerifyNinaRequestSchema.safeParse({ ...valid(), requesterCountry: 'FRA' }).success).toBe(
      false,
    );
  });

  it('rejette un requestId non-UUID', () => {
    expect(VerifyNinaRequestSchema.safeParse({ ...valid(), requestId: '123' }).success).toBe(false);
  });

  it('rejette un timestamp non ISO', () => {
    expect(VerifyNinaRequestSchema.safeParse({ ...valid(), timestamp: 'hier' }).success).toBe(
      false,
    );
  });
});

describe('VerifyNinaResponseSchema (privacy by design)', () => {
  it('accepte la réponse minimaliste', () => {
    const ok = VerifyNinaResponseSchema.safeParse({
      exists: true,
      valid: true,
      vulnerable: false,
      lastUpdated: '2026-04-15',
    });
    expect(ok.success).toBe(true);
  });

  it('accepte vulnerable et lastUpdated null (donnée absente)', () => {
    const ok = VerifyNinaResponseSchema.safeParse({
      exists: false,
      valid: false,
      vulnerable: null,
      lastUpdated: null,
    });
    expect(ok.success).toBe(true);
  });

  it('STRIPPE tout champ identitaire injecté (pas de sur-divulgation)', () => {
    const parsed = VerifyNinaResponseSchema.parse({
      exists: true,
      valid: true,
      vulnerable: false,
      lastUpdated: '2026-04-15',
      firstName: 'Aminata', // tentative de fuite — doit disparaître
      photoUrl: 'http://x/y.jpg',
    });
    expect(parsed).not.toHaveProperty('firstName');
    expect(parsed).not.toHaveProperty('photoUrl');
  });
});
