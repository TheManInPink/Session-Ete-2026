/**
 * @file        correction.service.spec.ts
 * @description Tests unitaires de `CorrectionService.listForCitizen` — la route
 *              PC-05 self-scoped (`GET /corrections/me`). Vérifie l'invariant
 *              anti-IDOR : la requête est TOUJOURS filtrée sur le NINA (normalisé)
 *              fourni par le controller depuis le token, jamais sur un paramètre
 *              client, et ne remonte que les corrections non supprimées.
 *
 *              `@nina-aes/database` (Prisma) est mocké : aucun accès DB réel.
 *              `@nina-aes/utils` (normalizeNina) reste RÉEL (mappé sur la source
 *              par la jest.config) — la normalisation est donc réellement exercée.
 *
 * @module      identity-service/test
 */

// ⚠️ Doit précéder l'import de CorrectionService (hoisté par jest de toute façon).
jest.mock('@nina-aes/database', () => ({
  prisma: {
    correctionRequest: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
  // `Prisma` n'est utilisé que comme namespace de TYPES dans le service (effacé
  // à la compilation) : un objet vide suffit au runtime.
  Prisma: {},
}));

import { prisma } from '@nina-aes/database';

import { CorrectionService } from '../src/modules/correction/correction.service';

const findMany = (prisma as unknown as { correctionRequest: { findMany: jest.Mock } })
  .correctionRequest.findMany;
const count = (prisma as unknown as { correctionRequest: { count: jest.Mock } }).correctionRequest
  .count;

describe('CorrectionService.listForCitizen (PC-05 self-scoped, anti-IDOR)', () => {
  let service: CorrectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    // http + rabbit non sollicités par listForCitizen → stubs inertes.
    service = new CorrectionService({} as never, {} as never);
  });

  it('filtre sur le NINA NORMALISÉ du token + deletedAt null, ordre antéchronologique', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    // NINA saisi avec séparateurs → DOIT être normalisé avant la requête
    // (la colonne `citizen.nina` est stockée normalisée, cf. citizen.service).
    await service.listForCitizen('1 89 03 1 02 015 042 V');

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0] as {
      where: unknown;
      orderBy: unknown;
    };
    expect(arg.where).toEqual({
      deletedAt: null,
      citizen: { is: { nina: '18903102015042V' } },
    });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });

    // Le count porte EXACTEMENT le même filtre (total cohérent avec la page).
    const countArg = count.mock.calls[0][0] as { where: unknown };
    expect(countArg.where).toEqual(arg.where);
  });

  it('retourne { data, total } tels quels depuis Prisma', async () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }];
    findMany.mockResolvedValue(rows);
    count.mockResolvedValue(2);

    const res = await service.listForCitizen('18903102015042V');

    expect(res).toEqual({ data: rows, total: 2 });
  });

  it('normalise aussi la casse (une lettre de contrôle minuscule est remontée)', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await service.listForCitizen('18903102015042v');

    const arg = findMany.mock.calls[0][0] as { where: { citizen: { is: { nina: string } } } };
    expect(arg.where.citizen.is.nina).toBe('18903102015042V');
  });
});
