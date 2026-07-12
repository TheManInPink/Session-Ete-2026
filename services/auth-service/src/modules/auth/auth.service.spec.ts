/**
 * @file        auth.service.spec.ts
 * @description Tests de {@link AuthService.exchangeSsoToken} (échange SSO citoyen,
 *              ADR-036). Cible la logique de sécurité : vérification du token →
 *              résolution DB → rôle **citoyen uniquement** → émission de session
 *              avec rôle **normalisé en casse basse** (contrat de token aval).
 *
 *              `@nina-aes/database` (ESM, client Prisma) est mocké pour que la
 *              chaîne d'import (UserRepository) se charge sous ts-jest sans tirer
 *              le vrai client — cf. mémoire « Jest + ESM database mock ».
 */

jest.mock('@nina-aes/database', () => ({
  Prisma: { PrismaClientKnownRequestError: class {} },
  prisma: {},
  disconnectPrisma: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';

import { UserRole } from '../../common/types.js';

import { AuthService } from './auth.service.js';

const buildService = (
  over: {
    verify?: jest.Mock;
    validatePassword?: jest.Mock;
    findByKeycloakId?: jest.Mock;
    updateLastLogin?: jest.Mock;
    findCitizenNinaByEmail?: jest.Mock;
  } = {},
) => {
  const keycloakVerifier = {
    verify: over.verify ?? jest.fn().mockResolvedValue({ sub: 'kc-123' }),
  };
  const keycloakAuth = {
    validatePassword:
      over.validatePassword ?? jest.fn().mockResolvedValue({ keycloakSub: 'kc-123' }),
  };
  const users = {
    findByKeycloakId:
      over.findByKeycloakId ??
      jest.fn().mockResolvedValue({ id: 'user-1', email: 'aissata@example.ml', role: 'CITIZEN' }),
    updateLastLogin: over.updateLastLogin ?? jest.fn().mockResolvedValue(undefined),
    findCitizenNinaByEmail:
      over.findCitizenNinaByEmail ?? jest.fn().mockResolvedValue('1234567890123'),
  };
  const jwt = {
    signAccess: jest.fn().mockReturnValue('access.jwt'),
    signRefresh: jest
      .fn()
      .mockReturnValue({ token: 'refresh.jwt', jti: 'jti-1', family: 'fam-1', expiresAt: 1 }),
    signMfaChallenge: jest
      .fn()
      .mockReturnValue({ token: 'challenge.jwt', jti: 'ch-1', expiresAt: 1 }),
  };
  const refreshSvc = { persist: jest.fn().mockResolvedValue(undefined) };

  const service = new AuthService(
    undefined as never, // otp
    users as never,
    undefined as never, // keycloakAdmin
    keycloakAuth as never,
    keycloakVerifier as never,
    jwt as never,
    undefined as never, // redis
    refreshSvc as never,
    undefined as never, // sms
  );
  return { service, keycloakVerifier, keycloakAuth, users, jwt, refreshSvc };
};

describe('AuthService.exchangeSsoToken', () => {
  it('émet une session citoyenne (rôle normalisé en casse basse + nina gravé)', async () => {
    const { service, users, jwt, refreshSvc } = buildService();

    const session = await service.exchangeSsoToken({ keycloakToken: 'kc.access.token' });

    expect(users.findByKeycloakId).toHaveBeenCalledWith('kc-123');
    expect(session).toEqual({
      user: { id: 'user-1', email: 'aissata@example.ml', role: UserRole.CITIZEN },
      access: 'access.jwt',
      refresh: 'refresh.jwt',
      expiresIn: 900,
    });
    // Le rôle signé DOIT être la casse basse 'citizen' (contrat aval RolesGuard)
    // et le `nina` du citoyen gravé (anti-IDOR NinaOwnershipGuard).
    expect(jwt.signAccess).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.CITIZEN, nina: '1234567890123', kcSub: 'kc-123' }),
    );
    expect(refreshSvc.persist).toHaveBeenCalledWith('jti-1', 'user-1', 'fam-1');
  });

  it('refuse un token valide sans compte DB (drift) — 401 uniforme, pas de session', async () => {
    const { service, jwt } = buildService({
      findByKeycloakId: jest.fn().mockResolvedValue(null),
    });
    await expect(service.exchangeSsoToken({ keycloakToken: 't' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.signAccess).not.toHaveBeenCalled();
  });

  it('refuse un rôle interne (agent) — aucun contournement du MFA', async () => {
    const { service, jwt } = buildService({
      findByKeycloakId: jest
        .fn()
        .mockResolvedValue({ id: 'u2', email: 'agent@ctdec.ml', role: 'AGENT' }),
    });
    await expect(service.exchangeSsoToken({ keycloakToken: 't' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.signAccess).not.toHaveBeenCalled();
  });

  it('propage le rejet du vérificateur (token Keycloak invalide) sans toucher la DB', async () => {
    const { service, users } = buildService({
      verify: jest.fn().mockRejectedValue(new UnauthorizedException('AUTH_TOKEN_INVALID')),
    });
    await expect(service.exchangeSsoToken({ keycloakToken: 'bad' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findByKeycloakId).not.toHaveBeenCalled();
  });

  it('émet la session même si updateLastLogin échoue (best-effort non bloquant)', async () => {
    const { service } = buildService({
      updateLastLogin: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const session = await service.exchangeSsoToken({ keycloakToken: 't' });
    expect(session.access).toBe('access.jwt');
  });
});

describe('AuthService.login (normalisation du rôle DB)', () => {
  it('un rôle interne (agent) engage la MFA — challenge signé en casse basse, pas de session', async () => {
    const { service, jwt } = buildService({
      findByKeycloakId: jest.fn().mockResolvedValue({
        id: 'a1',
        email: 'agent@ctdec.ml',
        role: 'AGENT',
        mfaEnabled: true,
        mfaSecret: 'enc',
        phoneNumber: '+22370000000',
      }),
    });

    const result = await service.login({ identifier: 'agent@ctdec.ml', password: 'x' });

    expect(result).toMatchObject({ mfaRequired: true, challenge: 'challenge.jwt' });
    expect((result as { methods: string[] }).methods).toEqual(
      expect.arrayContaining(['totp', 'sms']),
    );
    // Le rôle DB 'AGENT' doit être normalisé 'agent' AVANT le test MFA + la signature
    // du challenge — sinon MFA_REQUIRED_ROLES.has('AGENT') serait faux (bypass).
    expect(jwt.signMfaChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.AGENT }),
    );
    expect(jwt.signAccess).not.toHaveBeenCalled();
  });

  it('un citoyen obtient une session complète avec nina (pas de MFA)', async () => {
    const { service, jwt } = buildService(); // findByKeycloakId → role 'CITIZEN' par défaut

    const result = await service.login({ identifier: 'aissata@example.ml', password: 'x' });

    expect(result).toMatchObject({ access: 'access.jwt', refresh: 'refresh.jwt' });
    expect(jwt.signMfaChallenge).not.toHaveBeenCalled();
    expect(jwt.signAccess).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.CITIZEN, nina: '1234567890123' }),
    );
  });
});
