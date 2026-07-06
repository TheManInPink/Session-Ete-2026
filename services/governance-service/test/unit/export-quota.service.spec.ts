/**
 * @file        export-quota.service.spec.ts
 * @description Tests du quota d'export DGE atomique : réservation OK sous le
 *              plafond, 429 quand l'UPDATE conditionnel ne renvoie aucune ligne
 *              (plafond atteint). Le `$queryRaw` Prisma est mocké.
 * @module      governance-service/test
 */
const queryRaw = jest.fn();
jest.mock('@nina-aes/database', () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
  // `Prisma.sql` est utilisé comme tag de template — on le neutralise.
  Prisma: { sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }) },
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExportQuotaService } from '../../src/electoral/export-quota.service.js';

function makeService(limit = 5): ExportQuotaService {
  const cfg = { get: () => limit } as unknown as ConfigService<never, true>;
  return new ExportQuotaService(cfg);
}

describe('ExportQuotaService — quota atomique par compte', () => {
  beforeEach(() => queryRaw.mockReset());

  it('autorise un export sous le plafond (UPDATE renvoie le compteur)', async () => {
    queryRaw.mockResolvedValue([{ count: 3 }]);
    const svc = makeService(5);
    await expect(svc.assertWithinDailyQuota('dge-1')).resolves.toBe(3);
    expect(queryRaw).toHaveBeenCalledTimes(1); // une seule opération atomique
  });

  it('lève 429 quand l’UPDATE conditionnel ne renvoie AUCUNE ligne (plafond atteint)', async () => {
    queryRaw.mockResolvedValue([]); // WHERE count < limit a bloqué l'incrément
    const svc = makeService(5);
    await expect(svc.assertWithinDailyQuota('dge-1')).rejects.toMatchObject({
      constructor: HttpException,
    });
    await expect(svc.assertWithinDailyQuota('dge-1')).rejects.toHaveProperty(
      'status',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });
});
