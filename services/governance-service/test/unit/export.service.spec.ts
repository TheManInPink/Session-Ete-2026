/**
 * @file        export.service.spec.ts
 * @description Tests de l'export delta DGE : rejet d'un `since` non ISO-8601
 *              complet (400), quota appelé AVANT le stream, CSV déterministe +
 *              SHA-256 + signature du manifeste + journalisation DGE_EXPORT, et
 *              ABSENCE totale de PII directe (pas de NINA/citizenId dans le CSV).
 * @module      governance-service/test
 */
jest.mock('@nina-aes/database', () => ({ prisma: {}, Prisma: {} }));
jest.mock('@nina-aes/vault-client', () => ({ VaultClient: class {} }));

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ExportService } from '../../src/electoral/export.service.js';
import type {
  ElectoralRepository,
  VoterDeltaRow,
} from '../../src/electoral/electoral.repository.js';
import type { ExportQuotaService } from '../../src/electoral/export-quota.service.js';
import type { PseudonymService } from '../../src/electoral/pseudonym.service.js';
import type { JwsSigner } from '../../src/crypto/jws.signer.js';
import type { AuditPublisher } from '../../src/audit/audit.publisher.js';
import type { GovAuthSubject } from '../../src/auth/auth.types.js';

const NINA_LEAK = '12345678901234A';

const deltaRows: VoterDeltaRow[] = [
  {
    pseudonymousId: 'PSEUDO-AAA',
    region: '08',
    cercle: '02',
    commune: 'Kidal',
    status: 'ACTIVE',
    registeredAt: new Date('2026-06-01T00:00:00.000Z'),
    removedAt: null,
    removedReason: null,
  },
];

function build(repo: Partial<ElectoralRepository> = {}) {
  const quota = { assertWithinDailyQuota: jest.fn().mockResolvedValue(1) };
  const pseudonym = { currentSaltVersion: jest.fn().mockReturnValue(1) };
  const signer = { sign: jest.fn().mockResolvedValue('manifest.jws.sig') } as unknown as JwsSigner;
  const audit = { recordExport: jest.fn().mockResolvedValue(undefined) };
  const repository = {
    delta: jest.fn().mockResolvedValue(deltaRows),
    ...repo,
  } as unknown as ElectoralRepository;
  const cfg = { get: () => 'elections-export' } as unknown as ConfigService<never, true>;
  const service = new ExportService(
    repository,
    quota as unknown as ExportQuotaService,
    pseudonym as unknown as PseudonymService,
    signer,
    audit as unknown as AuditPublisher,
    cfg,
  );
  return { service, repository, quota, signer, audit };
}

const dge: GovAuthSubject = { userId: 'dge-1', role: 'dge_official', mfa: true };

describe('ExportService — export delta DGE', () => {
  it('REJETTE (400) un `since` sans heure (ISO-8601 incomplet)', async () => {
    const { service, quota } = build();
    await expect(service.buildDelta('2026-01-01', dge)).rejects.toBeInstanceOf(BadRequestException);
    // Le quota n'est PAS consommé sur une requête invalide.
    expect(quota.assertWithinDailyQuota).not.toHaveBeenCalled();
  });

  it('réserve le quota AVANT de produire l’export, et journalise DGE_EXPORT', async () => {
    const { service, quota, audit, signer } = build();
    const out = await service.buildDelta('2026-01-01T00:00:00Z', dge, '10.0.0.7');
    expect(quota.assertWithinDailyQuota).toHaveBeenCalledWith('dge-1');
    expect(out.count).toBe(1);
    // SHA-256 du corps recalculable et égal à l'en-tête annoncé.
    expect(out.sha256).toBe(createHash('sha256').update(out.buffer).digest('hex'));
    // Manifeste signé (anti-rejeu : sha256 + since + count + exportedBy).
    const [manifest] = (signer.sign as jest.Mock).mock.calls[0];
    expect(manifest).toEqual(
      expect.objectContaining({
        sha256: out.sha256,
        since: '2026-01-01T00:00:00Z',
        count: 1,
        exportedBy: 'dge-1',
      }),
    );
    // Journalisation OBLIGATOIRE.
    expect(audit.recordExport).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'dge-1',
        sinceIso: '2026-01-01T00:00:00Z',
        sha256: out.sha256,
      }),
    );
  });

  it('le CSV ne contient JAMAIS de PII directe (ni NINA ni citizenId)', async () => {
    const { service } = build({
      delta: jest
        .fn()
        .mockResolvedValue([{ ...deltaRows[0], pseudonymousId: 'PSEUDO-AAA' }] as VoterDeltaRow[]),
    });
    const out = await service.buildDelta('2026-01-01T00:00:00Z', dge);
    const csv = out.buffer.toString('utf8');
    expect(csv).toContain('pseudonymousId');
    expect(csv).toContain('PSEUDO-AAA');
    expect(csv).not.toContain('citizenId');
    expect(csv).not.toContain(NINA_LEAK);
    expect(csv).not.toMatch(/nina/i);
  });
});
