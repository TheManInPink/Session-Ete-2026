/**
 * @file        verify-nina.service.spec.ts
 * @description Tests du cœur métier verify-nina : cert pair inconnu/révoqué →
 *              403 (§5bis), réponse MINIMALISTE pour NINA existant/absent/révoqué
 *              (privacy by design), mapping du verdict, et signature de réponse
 *              adressée au bon pays (aud:aes:<pair>, bug aud:undefined corrigé).
 * @module      interop-service/test
 */
import { createHash } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';

// `@nina-aes/database` est ESM : on le mocke pour le runtime CommonJS de Jest.
// `checkNina` lit `prisma.citizen.findFirst` (et NON `findUnique`) afin de pouvoir
// nommer la clé `deletedAt` au premier niveau du `where` et ainsi NEUTRALISER
// l'auto-filtre soft-delete (sinon les NINA révoqués seraient invisibles → faux
// NO_MATCH). On pilote la valeur de retour par test et on capte les `args` pour
// vérifier que le prédicat de contournement est bien présent.
const findFirst = jest.fn();
jest.mock('@nina-aes/database', () => ({
  prisma: { citizen: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}));

import { VerifyNinaService } from '../../src/bcid/verify-nina.service.js';
import type { PartnerRepository } from '../../src/bcid/partner.repository.js';
import type { Ed25519SignerService } from '../../src/keys/ed25519-signer.service.js';
import { fakeConfig } from '../helpers/config.helper.js';

/** Faux repository : `findActiveByFingerprint` configurable + capture des logs. */
function fakePartners(found: unknown): PartnerRepository {
  return {
    findActiveByFingerprint: jest.fn().mockResolvedValue(found),
    createVerificationLog: jest.fn().mockResolvedValue({ id: 'log-1' }),
  } as unknown as PartnerRepository;
}

/** Faux signer : renvoie un JWS factice + capte les options d'audience. */
function fakeSigner(): { svc: Ed25519SignerService; calls: unknown[] } {
  const calls: unknown[] = [];
  const svc = {
    sign: jest.fn(async (_p: unknown, opts: unknown) => {
      calls.push(opts);
      return 'jws.compact.signature';
    }),
  } as unknown as Ed25519SignerService;
  return { svc, calls };
}

function makeService(found: unknown) {
  const { svc: signer, calls } = fakeSigner();
  const partners = fakePartners(found);
  const svc = new VerifyNinaService(fakeConfig(), partners, signer);
  return { svc, calls, partners };
}

const baseRequest = () => ({
  nina: '18903102015042V',
  requesterCountry: 'BFA' as const,
  purpose: 'border-control' as const,
  requestId: '11111111-1111-1111-1111-111111111111',
  timestamp: new Date().toISOString(),
});

describe('VerifyNinaService.assertPeerKnown (tests négatifs §5bis)', () => {
  it('cert pair INCONNU/RÉVOQUÉ (repo renvoie null) → 403 ForbiddenException', async () => {
    const { svc } = makeService(null);
    await expect(svc.assertPeerKnown('BFA', 'f'.repeat(64))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('cert pair connu et actif → renvoie le partenaire', async () => {
    const partner = { id: 'p-bfa', country: 'BFA' };
    const { svc } = makeService(partner);
    await expect(svc.assertPeerKnown('BFA', 'a'.repeat(64))).resolves.toBe(partner);
  });
});

describe('VerifyNinaService.checkNina (réponse minimaliste, privacy by design)', () => {
  beforeEach(() => findFirst.mockReset());

  it('NINA inconnu → { exists:false, valid:false, vulnerable:null, lastUpdated:null }', async () => {
    findFirst.mockResolvedValueOnce(null);
    const { svc } = makeService({ country: 'BFA' });
    const res = await svc.checkNina(baseRequest());
    expect(res).toEqual({ exists: false, valid: false, vulnerable: null, lastUpdated: null });
  });

  it('NINA actif vulnérable → exists/valid true, vulnerable true, lastUpdated YYYY-MM-DD', async () => {
    findFirst.mockResolvedValueOnce({
      vulnerabilityCategory: 'ELDERLY',
      updatedAt: new Date('2026-04-15T10:00:00Z'),
      deletedAt: null,
    });
    const { svc } = makeService({ country: 'BFA' });
    const res = await svc.checkNina(baseRequest());
    expect(res).toEqual({
      exists: true,
      valid: true,
      vulnerable: true,
      lastUpdated: '2026-04-15',
    });
    // Aucune donnée identitaire ne fuit (pas de nom/prénom/photo).
    expect(Object.keys(res).sort()).toEqual(['exists', 'lastUpdated', 'valid', 'vulnerable']);
  });

  it('NINA révoqué (deletedAt non null) → exists:true, valid:false (verdict REVOKED)', async () => {
    findFirst.mockResolvedValueOnce({
      vulnerabilityCategory: null,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      deletedAt: new Date('2026-02-01T00:00:00Z'),
    });
    const { svc } = makeService({ country: 'BFA' });
    const res = await svc.checkNina(baseRequest());
    expect(res.exists).toBe(true);
    expect(res.valid).toBe(false);
    expect(res.vulnerable).toBe(false);
    // Non-régression sémantique : un NINA révoqué DOIT mapper sur REVOKED,
    // jamais sur NO_MATCH (le pays pair doit distinguer inconnu vs révoqué).
    expect(svc.resultOf(res)).toBe('REVOKED');
  });

  it('CONTOURNEMENT soft-delete : le where nomme explicitement `deletedAt` (clé de 1er niveau)', async () => {
    // Régression : sans clé `deletedAt` au premier niveau du where, l'extension
    // soft-delete de @nina-aes/database réinjecte `deletedAt: null` et masque les
    // NINA révoqués. On VÉRIFIE que checkNina passe bien le prédicat de bypass et
    // lit via `findFirst` (findUnique n'accepte pas de filtre non-unique).
    findFirst.mockResolvedValueOnce(null);
    const { svc } = makeService({ country: 'BFA' });
    await svc.checkNina(baseRequest());
    const args = findFirst.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(Object.prototype.hasOwnProperty.call(args.where, 'deletedAt')).toBe(true);
    expect(args.where['deletedAt']).toEqual({ not: undefined });
    expect(args.where['nina']).toBe(baseRequest().nina);
  });
});

describe('VerifyNinaService.resultOf (mapping verdict)', () => {
  it('mappe NO_MATCH / REVOKED / MATCH', () => {
    const { svc } = makeService({ country: 'BFA' });
    expect(svc.resultOf({ exists: false, valid: false, vulnerable: null, lastUpdated: null })).toBe(
      'NO_MATCH',
    );
    expect(
      svc.resultOf({ exists: true, valid: false, vulnerable: false, lastUpdated: '2026-01-01' }),
    ).toBe('REVOKED');
    expect(
      svc.resultOf({ exists: true, valid: true, vulnerable: false, lastUpdated: '2026-01-01' }),
    ).toBe('MATCH');
  });
});

describe('VerifyNinaService.signResponse (aud:aes:<pair> — bug aud:undefined corrigé)', () => {
  it('signe la réponse avec aud = aes:BFA (pays pair, pas undefined)', async () => {
    const { svc, calls } = makeService({ country: 'BFA' });
    const jws = await svc.signResponse(
      { exists: true, valid: true, vulnerable: false, lastUpdated: '2026-04-15' },
      'BFA',
    );
    expect(jws).toBe('jws.compact.signature');
    expect((calls[0] as { aud: string }).aud).toBe('aes:BFA');
    expect((calls[0] as { iss: string }).iss).toBe('https://interop.nina-aes.ml');
  });
});

describe('VerifyNinaService.logVerification (privacy by design — NINA jamais en clair)', () => {
  it('journalise le hash SHA-256 mais NE persiste PAS le NINA en clair', async () => {
    const { svc, partners } = makeService({ country: 'BFA' });
    const request = baseRequest();
    const ctx = {
      partner: { country: 'BFA' },
      jti: request.requestId,
      correlationId: 'corr-1',
      clientIp: '203.0.113.7',
      startedAt: Date.now(),
    };

    await svc.logVerification({
      request,
      response: { exists: true, valid: true, vulnerable: false, lastUpdated: '2026-04-15' },
      ctx: ctx as unknown as Parameters<typeof svc.logVerification>[0]['ctx'],
      jwsResponse: 'jws.compact.signature',
    });

    const create = partners.createVerificationLog as jest.Mock;
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]![0] as Record<string, unknown>;

    // Le hash SHA-256 du NINA est bien journalisé (corrélation/audit).
    const expectedHash = createHash('sha256').update(request.nina).digest('hex');
    expect(data['requestedNinaHash']).toBe(expectedHash);

    // PRIVACY : aucune valeur persistée ne contient le NINA en clair, et la
    // colonne historique `targetNina` a été SUPPRIMÉE (data-minimization).
    expect(data['targetNina']).toBeUndefined();
    expect(Object.values(data)).not.toContain(request.nina);
  });
});
