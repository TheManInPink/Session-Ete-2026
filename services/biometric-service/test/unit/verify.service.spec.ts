/**
 * @file        verify.service.spec.ts
 * @description Tests de la VÉRIFICATION 1:1 :
 *                - COMPARAISON SANS COURT-CIRCUIT : la boucle parcourt TOUS les
 *                  templates actifs même quand le PREMIER matche déjà (anti-timing,
 *                  doc 25 §4.3) — on vérifie que `distance` est appelé pour CHAQUE
 *                  template, pas seulement jusqu'au premier succès ;
 *                - MATCH (distance ≤ τ) → succès + reset anti-bruteforce + audit ;
 *                - NON-MATCH → échec + comptage anti-bruteforce ;
 *                - VERROUILLAGE anti-bruteforce après N échecs (refus + alerte SIEM).
 *              Collaborateurs mockés (le cœur cancelable est testé à part).
 * @module      biometric-service/test
 */
import { ForbiddenException } from '@nestjs/common';

jest.mock('@nina-aes/database', () => ({
  prisma: {},
  BiometricKind: { FINGERPRINT: 'FINGERPRINT', FACE: 'FACE' },
}));
// `@nina-aes/vault-client` (ESM) est importé transitivement via `cancelable.service`.
// On le MOCKE : le CancelableService est injecté directement (pas de Vault réel).
jest.mock('@nina-aes/vault-client', () => ({ VaultClient: class {} }));

import { VerifyService } from '../../src/verify/verify.service.js';
import type { CancelableService } from '../../src/cancelable/cancelable.service.js';
import type { TemplatesRepository } from '../../src/templates/templates.repository.js';
import type { FailureTrackerService } from '../../src/verify/failure-tracker.service.js';
import type { ConsentService } from '../../src/consent/consent.service.js';
import type { AuditPublisher } from '../../src/audit/audit.publisher.js';
import type { BioAuthSubject } from '../../src/auth/auth.types.js';

const AGENT: BioAuthSubject = { userId: 'agent-1', role: 'biometric_operator', mfa: true };
const CITIZEN = '11111111-1111-1111-1111-111111111111';

/** Fabrique un faux template actif. */
function tpl(transformKid: string, threshold = 0.32) {
  return {
    id: BigInt(1),
    protectedTemplate: Buffer.from([1, 2, 3]),
    transformKid,
    matchThreshold: threshold,
  };
}

function makeService(opts: {
  templates: ReturnType<typeof tpl>[];
  distances: number[]; // distance renvoyée à chaque appel (dans l'ordre)
  locked?: boolean;
  consentOk?: boolean; // consentement de matching actif (défaut : true)
}) {
  const distanceMock = jest.fn();
  for (const d of opts.distances) distanceMock.mockReturnValueOnce(d);

  const cancelable = {
    protect: jest.fn().mockResolvedValue(new Uint8Array([9, 9, 9])),
    distance: distanceMock,
    isMatch: (d: number, t: number) => d <= t,
  } as unknown as CancelableService;

  const templates = {
    findActiveByCitizen: jest.fn().mockResolvedValue(opts.templates),
  } as unknown as TemplatesRepository;

  const recordFailure = jest.fn().mockReturnValue(false);
  const reset = jest.fn();
  const failures = {
    isLocked: jest.fn().mockReturnValue(opts.locked ?? false),
    recordFailure,
    reset,
  } as unknown as FailureTrackerService;

  const consent = {
    hasActiveMatchingConsent: jest.fn().mockResolvedValue(opts.consentOk ?? true),
  } as unknown as ConsentService;

  const audit = {
    recordAccess: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(true),
  } as unknown as AuditPublisher;

  const service = new VerifyService(cancelable, templates, failures, consent, audit);
  return {
    service,
    cancelable,
    templates,
    failures,
    consent,
    audit,
    distanceMock,
    recordFailure,
    reset,
  };
}

const dto = (over: Partial<{ reason: string }> = {}) => ({
  citizenId: CITIZEN,
  featureVector: Array.from({ length: 32 }, (_v, i) => Math.sin(i) + 0.5),
  reason: 'guichet-acte-sensible',
  ...over,
});

describe('VerifyService — 1:1', () => {
  it('COMPARE SANS COURT-CIRCUIT : parcourt TOUS les templates même si le 1er matche', async () => {
    // 3 templates ; le PREMIER matche déjà (distance 0.1 ≤ τ). Une implémentation
    // à court-circuit s'arrêterait au 1er → distance appelée 1 fois. Ici on EXIGE
    // 3 appels (boucle complète, anti-timing).
    const { service, distanceMock, audit } = makeService({
      templates: [tpl('v1'), tpl('v1'), tpl('v2')],
      distances: [0.1, 0.9, 0.9],
    });
    const res = await service.verifyFingerprint(dto(), AGENT, '127.0.0.1');
    expect(res.match).toBe(true);
    expect(distanceMock).toHaveBeenCalledTimes(3); // pas d'early-exit
    expect(audit.recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'verify_success', entityId: CITIZEN }),
    );
  });

  it('MATCH au DERNIER template (distance ≤ τ) → succès + reset anti-bruteforce', async () => {
    const { service, reset, distanceMock } = makeService({
      templates: [tpl('v1'), tpl('v2')],
      distances: [0.9, 0.2], // seul le dernier matche
    });
    const res = await service.verifyFingerprint(dto(), AGENT);
    expect(res.match).toBe(true);
    expect(distanceMock).toHaveBeenCalledTimes(2);
    expect(reset).toHaveBeenCalledWith('agent-1', CITIZEN);
  });

  it('NON-MATCH → échec + comptage anti-bruteforce + audit attribuable au citoyen', async () => {
    const { service, recordFailure, audit } = makeService({
      templates: [tpl('v1')],
      distances: [0.8],
    });
    const res = await service.verifyFingerprint(dto(), AGENT);
    expect(res.match).toBe(false);
    expect(recordFailure).toHaveBeenCalledWith('agent-1', CITIZEN);
    expect(audit.recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'verify_fail', entityId: CITIZEN }),
    );
  });

  it('VERROUILLAGE anti-bruteforce actif → refus (403) + trace', async () => {
    const { service, audit } = makeService({ templates: [tpl('v1')], distances: [], locked: true });
    await expect(service.verifyFingerprint(dto(), AGENT)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(audit.recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'verify_locked' }),
    );
  });

  it('aucun template actif → NON-MATCH UNIFORME (anti-oracle, pas de 404) + échec compté', async () => {
    // ANTI-ÉNUMÉRATION (doc 25 §4.3) : un citoyen SANS template ne renvoie PAS un
    // 404 distinct (ce serait un oracle d'enrôlement). On suit EXACTEMENT le chemin
    // du non-match : {match:false} + échec anti-bruteforce compté + audit verify_fail.
    const { service, recordFailure, audit } = makeService({ templates: [], distances: [] });
    const res = await service.verifyFingerprint(dto(), AGENT);
    expect(res.match).toBe(false);
    expect(recordFailure).toHaveBeenCalledWith('agent-1', CITIZEN);
    expect(audit.recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'verify_fail', entityId: CITIZEN }),
    );
  });

  it('consentement de matching inactif → NON-MATCH UNIFORME (aucun template chargé)', async () => {
    // Le RETRAIT du consentement interdit tout nouvel appariement, MÊME si des
    // templates existent encore (DPIA §5). Observabilité IDENTIQUE au non-match :
    // pas de chargement de template, {match:false} + échec compté.
    const { service, templates, recordFailure } = makeService({
      templates: [tpl('v1')],
      distances: [0.1], // matcherait si on chargeait — mais consent inactif court-circuite
      consentOk: false,
    });
    const res = await service.verifyFingerprint(dto(), AGENT);
    expect(res.match).toBe(false);
    expect(templates.findActiveByCitizen).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledWith('agent-1', CITIZEN);
  });
});
