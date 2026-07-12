/**
 * @file        types.spec.ts
 * @description `normalizeUserRole` : projection du rôle Prisma (casse HAUTE)
 *              vers l'enum applicatif {@link UserRole} (casse basse). Invariant
 *              critique — sans lui, MFA contournée + tokens citoyens sans nina.
 */

import { normalizeUserRole, UserRole } from './types.js';

describe('normalizeUserRole', () => {
  it('mappe chaque rôle Prisma (casse haute) vers UserRole (casse basse)', () => {
    expect(normalizeUserRole('CITIZEN')).toBe(UserRole.CITIZEN);
    expect(normalizeUserRole('AGENT')).toBe(UserRole.AGENT);
    expect(normalizeUserRole('SUPERVISOR')).toBe(UserRole.SUPERVISOR);
    expect(normalizeUserRole('ADMIN')).toBe(UserRole.ADMIN);
    expect(normalizeUserRole('AUDITOR')).toBe(UserRole.AUDITOR);
    expect(normalizeUserRole('ANTICORRUPTION_INSPECTOR')).toBe(UserRole.ANTICORRUPTION_INSPECTOR);
  });

  it('est idempotent sur une valeur déjà en casse basse', () => {
    expect(normalizeUserRole('citizen')).toBe(UserRole.CITIZEN);
  });

  it('lève sur un rôle inconnu (garde-fou anti-token mal typé)', () => {
    expect(() => normalizeUserRole('ROOT')).toThrow(/inconnu/i);
    expect(() => normalizeUserRole('')).toThrow(/inconnu/i);
  });
});
