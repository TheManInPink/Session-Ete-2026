/**
 * @file        enrollment.service.spec.ts
 * @description Tests de l'ENRÔLEMENT :
 *                - REFUS sans consentement actif ancré (la garde `assertActiveConsent`
 *                  lève 403 → pas d'enrôlement, pas de stockage) ;
 *                - SUCCÈS : on stocke UNIQUEMENT un template PROTÉGÉ (jamais le
 *                  vecteur clair / l'image) + métadonnées (kid, métrique, seuil τ,
 *                  ancre de consentement) + audit durable ;
 *                - le payload de création NE CONTIENT PAS le vecteur de features
 *                  (irréversibilité : seul `protectedTemplate` est persisté).
 *              Collaborateurs mockés.
 * @module      biometric-service/test
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

jest.mock('@nina-aes/database', () => ({
  prisma: {},
  BiometricKind: { FINGERPRINT: 'FINGERPRINT', FACE: 'FACE' },
}));
// `@nina-aes/vault-client` est ESM ; il est importé transitivement par
// `vault.module.ts` (chargé via `cancelable.service.ts`). On le MOCKE car les
// collaborateurs cancelable/consent sont injectés directement (pas de Vault réel).
jest.mock('@nina-aes/vault-client', () => ({ VaultClient: class {} }));

import { EnrollmentService } from '../../src/enrollment/enrollment.service.js';
import type { CancelableService } from '../../src/cancelable/cancelable.service.js';
import type { ConsentService } from '../../src/consent/consent.service.js';
import type { TemplatesRepository } from '../../src/templates/templates.repository.js';
import type { AuditPublisher } from '../../src/audit/audit.publisher.js';
import type { Env } from '../../src/config/env.schema.js';
import type { BioAuthSubject } from '../../src/auth/auth.types.js';

const AGENT: BioAuthSubject = { userId: 'agent-1', role: 'biometric_operator', mfa: true };
const CITIZEN = '11111111-1111-1111-1111-111111111111';

const ENV: Partial<Record<keyof Env, unknown>> = {
  BIOMETRIC_ACTIVE_TRANSFORM_KID: 'bio-transform-v1',
  BIOMETRIC_MATCH_THRESHOLD: 0.32,
  BIOMETRIC_MATCH_METRIC: 'hamming-normalized',
};
const cfg = { get: (k: keyof Env) => ENV[k] } as unknown as ConfigService<Env, true>;

function makeService(opts: { consentOk: boolean; citizenExists?: boolean }) {
  const assertActiveConsent = opts.consentOk
    ? jest.fn().mockResolvedValue({ signerKid: 'cit:x:ed25519:1', jti: 'jti-1' })
    : jest.fn().mockRejectedValue(new ForbiddenException('CONSENT_REQUIRED'));
  const consent = { assertActiveConsent } as unknown as ConsentService;

  const cancelable = {
    protect: jest.fn().mockResolvedValue(new Uint8Array([1, 1, 1, 1])),
  } as unknown as CancelableService;

  const create = jest.fn().mockResolvedValue({ id: BigInt(42) });
  const templates = {
    findCitizen: jest.fn().mockResolvedValue(opts.citizenExists === false ? null : { id: CITIZEN }),
    create,
  } as unknown as TemplatesRepository;

  const audit = {
    recordAccess: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditPublisher;

  const service = new EnrollmentService(cfg, cancelable, consent, templates, audit);
  return { service, consent, cancelable, templates, audit, create };
}

const dto = {
  citizenId: CITIZEN,
  featureVector: Array.from({ length: 32 }, (_v, i) => Math.cos(i)),
  templateFormat: 'ISO/IEC 19794-2 v2',
};

describe('EnrollmentService', () => {
  it('REFUSE sans consentement actif ancré (403) — pas de stockage', async () => {
    const { service, create } = makeService({ consentOk: false });
    await expect(service.enrollFingerprint(dto, AGENT)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('REFUSE pour un citoyen inconnu (404) — pas de stockage', async () => {
    const { service, create } = makeService({ consentOk: true, citizenExists: false });
    await expect(service.enrollFingerprint(dto, AGENT)).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
  });

  it('SUCCÈS : stocke UNIQUEMENT le template protégé + ancre de consentement (jamais le vecteur)', async () => {
    const { service, create, audit } = makeService({ consentOk: true });
    const res = await service.enrollFingerprint(dto, AGENT, '127.0.0.1');

    expect(res.id).toBe('42');
    expect(res.transformKid).toBe('bio-transform-v1');

    // Le payload de création porte le template PROTÉGÉ + métadonnées, JAMAIS le
    // vecteur de features clair ni une image.
    const arg = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.protectedTemplate).toBeInstanceOf(Uint8Array);
    expect(arg.matchThreshold).toBe(0.32);
    expect(arg.consentSignerKid).toBe('cit:x:ed25519:1');
    expect(arg.consentJti).toBe('jti-1');
    expect(JSON.stringify(arg)).not.toContain('featureVector');
    expect(Object.keys(arg)).not.toContain('image');

    expect(audit.recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'registered', entityType: 'BiometricTemplate' }),
    );
  });
});
