/**
 * @file        roles.guard.spec.ts
 * @description Tests du RolesGuard biométrie : rôle requis présent/absent,
 *              insensibilité à la casse, absence de `@Roles()` = pass.
 * @module      biometric-service/test
 */
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/auth/guards/roles.guard.js';
import { BiometricRole } from '../../src/common/biometric.roles.js';

function ctx(role?: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  } as unknown as ExecutionContext;
}

function guardWith(required: string[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard (biométrie)', () => {
  it('autorise le rôle requis (insensible à la casse)', () => {
    const guard = guardWith([BiometricRole.BIOMETRIC_OPERATOR]);
    expect(guard.canActivate(ctx('BIOMETRIC_OPERATOR'))).toBe(true);
  });

  it('refuse un rôle non autorisé', () => {
    const guard = guardWith([BiometricRole.INSPECTOR]);
    expect(() => guard.canActivate(ctx('biometric_operator'))).toThrow(ForbiddenException);
  });

  it('refuse l’absence de rôle', () => {
    const guard = guardWith([BiometricRole.BIOMETRIC_OPERATOR]);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it('aucun @Roles() posé = accès autorisé', () => {
    expect(guardWith(undefined).canActivate(ctx('citizen'))).toBe(true);
    expect(guardWith([]).canActivate(ctx('citizen'))).toBe(true);
  });
});
