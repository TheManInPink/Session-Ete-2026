/**
 * @file        user-context.signer.spec.ts
 * @description Tests du JWS interne X-User-Context : aller-retour sign/verify,
 *              détection d'altération, rejet d'un secret incorrect, claims.
 */
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuthSubject } from '@nina-aes/auth-guards';
import { UserContextSigner, USER_CONTEXT_ISSUER } from '../../src/auth/user-context.signer.js';
import type { Env } from '../../src/config/env.schema.js';

/** Fabrique un faux ConfigService renvoyant secret + ttl. */
function fakeConfig(secret: string, ttl = 60): ConfigService<Env, true> {
  return {
    get: (key: string) => (key === 'GATEWAY_HS256_SECRET' ? secret : ttl),
  } as unknown as ConfigService<Env, true>;
}

const SUBJECT: AuthSubject = {
  userId: 'NINA-123',
  role: 'agent',
  mfa: true,
  email: 'agent@ctdec.ml',
};

describe('UserContextSigner', () => {
  const secret = 'a'.repeat(40);
  const signer = new UserContextSigner(fakeConfig(secret));

  it('signe puis vérifie (aller-retour) en préservant les claims', () => {
    const token = signer.sign(SUBJECT);
    const claims = signer.verify(token);
    expect(claims.sub).toBe('NINA-123');
    expect(claims.role).toBe('agent');
    expect(claims.mfa).toBe(true);
    expect(claims.email).toBe('agent@ctdec.ml');
    expect(claims.iss).toBe(USER_CONTEXT_ISSUER);
    expect(typeof claims.exp).toBe('number');
  });

  it('rejette un token altéré', () => {
    const token = signer.sign(SUBJECT);
    const tampered = `${token.slice(0, -3)}xyz`;
    expect(() => signer.verify(tampered)).toThrow(UnauthorizedException);
  });

  it('rejette un token signé avec un autre secret', () => {
    const other = new UserContextSigner(fakeConfig('b'.repeat(40)));
    const token = other.sign(SUBJECT);
    expect(() => signer.verify(token)).toThrow(UnauthorizedException);
  });

  it("omet le claim email s'il est absent du sujet", () => {
    const token = signer.sign({ userId: 'u', role: 'citizen', mfa: false });
    const claims = signer.verify(token);
    expect(claims.email).toBeUndefined();
  });
});
