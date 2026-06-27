import { ForbiddenException } from '@nestjs/common';
import { DocumentOwnershipService } from '../../src/auth/document-ownership.guard';
import type { AuthSubjectWithNina } from '../../src/auth/request-user';

/**
 * Couverture du contrôle d'ownership anti-IDOR (A01) du download presigné.
 * Fail-closed : on n'autorise QU'À l'égalité stricte (citoyen) ou au privilège.
 */
describe('DocumentOwnershipService.assertCanAccess()', () => {
  const svc = new DocumentOwnershipService();
  const DOC_NINA = '189031020150042Z';

  const citizen = (nina?: string): AuthSubjectWithNina => ({
    userId: 'u-1',
    role: 'citizen',
    mfa: true,
    ...(nina ? { nina } : {}),
  });

  it('autorise le citoyen propriétaire (NINA identique)', () => {
    expect(() => svc.assertCanAccess(citizen(DOC_NINA), DOC_NINA)).not.toThrow();
  });

  it('autorise malgré une mise en forme différente (normalisation)', () => {
    expect(() => svc.assertCanAccess(citizen('1-89-03-1-02-015-0042-z'), DOC_NINA)).not.toThrow();
  });

  it('REFUSE un citoyen consultant la FDI d’autrui (IDOR)', () => {
    expect(() => svc.assertCanAccess(citizen('999999999999999X'), DOC_NINA)).toThrow(
      ForbiddenException,
    );
  });

  it('REFUSE un citoyen sans claim nina (token sans ownership)', () => {
    expect(() => svc.assertCanAccess(citizen(undefined), DOC_NINA)).toThrow(ForbiddenException);
  });

  it('REFUSE quand user est absent (défense en profondeur)', () => {
    expect(() => svc.assertCanAccess(undefined, DOC_NINA)).toThrow(ForbiddenException);
  });

  it.each(['agent', 'supervisor', 'admin', 'auditor', 'ADMIN', 'Agent'])(
    'autorise le rôle privilégié %s (accès transverse audité)',
    (role) => {
      const user: AuthSubjectWithNina = { userId: 'u-2', role, mfa: true };
      expect(() => svc.assertCanAccess(user, DOC_NINA)).not.toThrow();
    },
  );

  it('REFUSE un rôle inconnu sans nina', () => {
    const user: AuthSubjectWithNina = { userId: 'u-3', role: 'guest', mfa: false };
    expect(() => svc.assertCanAccess(user, DOC_NINA)).toThrow(ForbiddenException);
  });
});
