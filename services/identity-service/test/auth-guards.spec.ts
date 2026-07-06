/**
 * @file        auth-guards.spec.ts
 * @description Tests unitaires des guards de sécurité (fermeture du trou
 *              d'autorisation P0) :
 *                - JwtAuthGuard       : fail-closed + @Public() + mock NON-prod
 *                - RolesGuard         : RBAC (insensible à la casse)
 *                - NinaOwnershipGuard : anti-IDOR (citoyen = son NINA)
 *
 * @module      identity-service/test
 */

import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@nina-aes/shared-types';

import { JwtAuthGuard, RolesGuard, NinaOwnershipGuard } from '../src/auth/guards';
import type { JwtVerifier, AuthSubject } from '../src/auth/auth.types';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';

/** Construit un faux ExecutionContext HTTP avec la requête fournie. */
function ctxWith(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

/** Reflector renvoyant des métadonnées prédéfinies par clé. */
function reflectorWith(meta: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('court-circuite les routes @Public() sans token', () => {
    const guard = new JwtAuthGuard(
      { verifyAccess: jest.fn() } as JwtVerifier,
      reflectorWith({ [IS_PUBLIC_KEY]: true }),
    );
    expect(guard.canActivate(ctxWith({ headers: {} }))).toBe(true);
  });

  it('FAIL-CLOSED : refuse (401) une route protégée sans Bearer', () => {
    process.env.NINA_AUTH_MODE = 'jwks';
    const guard = new JwtAuthGuard({ verifyAccess: jest.fn() } as JwtVerifier, reflectorWith({}));
    expect(() => guard.canActivate(ctxWith({ headers: {} }))).toThrow(UnauthorizedException);
  });

  it('vérifie le token et peuple request.user (role normalisé)', () => {
    process.env.NINA_AUTH_MODE = 'jwks';
    const subject: AuthSubject = { userId: 'u-1', role: 'agent', mfa: true };
    const verifier: JwtVerifier = { verifyAccess: jest.fn().mockReturnValue(subject) };
    const guard = new JwtAuthGuard(verifier, reflectorWith({}));
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer abc.def.ghi' } };

    expect(guard.canActivate(ctxWith(req))).toBe(true);
    expect(verifier.verifyAccess).toHaveBeenCalledWith('abc.def.ghi');
    expect(req.user).toMatchObject({ id: 'u-1', role: UserRole.AGENT, mfa: true });
  });

  it('mode mock ACTIF en dev (injecte un agent)', () => {
    process.env.NINA_AUTH_MODE = 'mock';
    delete process.env.NODE_ENV;
    const guard = new JwtAuthGuard({ verifyAccess: jest.fn() } as JwtVerifier, reflectorWith({}));
    const req: Record<string, unknown> = { headers: {} };
    expect(guard.canActivate(ctxWith(req))).toBe(true);
    expect((req.user as { role: UserRole }).role).toBe(UserRole.AGENT);
  });

  it('mode mock IGNORÉ en production (auth réelle forcée → 401 sans token)', () => {
    process.env.NINA_AUTH_MODE = 'mock';
    process.env.NODE_ENV = 'production';
    const guard = new JwtAuthGuard({ verifyAccess: jest.fn() } as JwtVerifier, reflectorWith({}));
    expect(() => guard.canActivate(ctxWith({ headers: {} }))).toThrow(UnauthorizedException);
  });
});

describe('RolesGuard', () => {
  it('autorise si aucun @Roles() (auth déjà faite en amont)', () => {
    const guard = new RolesGuard(reflectorWith({}));
    expect(guard.canActivate(ctxWith({ user: { id: 'u', role: UserRole.CITIZEN } }))).toBe(true);
  });

  it('autorise un rôle présent dans @Roles()', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [UserRole.AGENT, UserRole.ADMIN] }));
    expect(guard.canActivate(ctxWith({ user: { id: 'u', role: UserRole.ADMIN } }))).toBe(true);
  });

  it('refuse (403) un rôle absent de @Roles()', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [UserRole.ADMIN] }));
    expect(() => guard.canActivate(ctxWith({ user: { id: 'u', role: UserRole.CITIZEN } }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuse (403) si aucun user (rôle requis mais non authentifié)', () => {
    const guard = new RolesGuard(reflectorWith({ [ROLES_KEY]: [UserRole.AGENT] }));
    expect(() => guard.canActivate(ctxWith({}))).toThrow(ForbiddenException);
  });
});

describe('NinaOwnershipGuard (anti-IDOR)', () => {
  const guard = new NinaOwnershipGuard();

  it('autorise un citoyen sur SON propre NINA', () => {
    const req = {
      user: { id: 'u', role: UserRole.CITIZEN, nina: '18903102015042V' },
      params: { nina: '18903102015042V' },
    };
    expect(guard.canActivate(ctxWith(req))).toBe(true);
  });

  it('REFUSE (403) un citoyen sur le NINA d’un autre', () => {
    const req = {
      user: { id: 'u', role: UserRole.CITIZEN, nina: '18903102015042V' },
      params: { nina: '29903102015042X' },
    };
    expect(() => guard.canActivate(ctxWith(req))).toThrow(ForbiddenException);
  });

  it('REFUSE (403) un citoyen SANS claim nina', () => {
    const req = { user: { id: 'u', role: UserRole.CITIZEN }, params: { nina: '18903102015042V' } };
    expect(() => guard.canActivate(ctxWith(req))).toThrow(ForbiddenException);
  });

  it('autorise un AGENT sur n’importe quel NINA (besoin métier)', () => {
    const req = { user: { id: 'a', role: UserRole.AGENT }, params: { nina: '29903102015042X' } };
    expect(guard.canActivate(ctxWith(req))).toBe(true);
  });

  it('autorise ADMIN/SUPERVISOR/AUDITOR (rôles privilégiés)', () => {
    for (const role of [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.AUDITOR]) {
      const req = { user: { id: 'x', role }, params: { nina: '29903102015042X' } };
      expect(guard.canActivate(ctxWith(req))).toBe(true);
    }
  });
});
