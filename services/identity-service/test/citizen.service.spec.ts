import { Test, TestingModule } from '@nestjs/testing';
import { CitizenService } from '../src/modules/citizen/citizen.service';
import { NotFoundException } from '@nestjs/common';

// Mock Prisma
jest.mock('@nina-aes/database', () => ({
  prisma: {
    citizen: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@nina-aes/utils', () => ({
  normalizeNina: jest.fn((nina: string) => nina.replace(/\s/g, '').toUpperCase()),
}));

// import { prisma } from '@nina-aes/database';
const { prisma } = require('@nina-aes/database');

describe('CitizenService', () => {
  let service: CitizenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CitizenService],
    }).compile();

    service = module.get<CitizenService>(CitizenService);
    jest.clearAllMocks();
  });

  describe('findByNina', () => {
    // devrait retourner un citoyen existant
    it('should return a citizen when NINA exists', async () => {
      const mockCitizen = {
        id: 'uuid-1',
        ninaNumber: '11995010100101A',
        firstName: 'Ibrahim',
        lastName: 'Keita',
        birthDate: new Date('1995-01-15'),
        sex: 'HOMME',
        birthPlace: { region: 'Bamako', commune: 'Commune III' },
        residence: { region: 'Bamako', commune: 'Commune V' },
        parent: {
          fatherFirstName: 'Moussa',
          fatherLastName: 'Keita',
          motherFirstName: 'Fatoumata',
          motherLastName: 'Traoré',
        },
      };

      (prisma.citizen.findUnique as jest.Mock).mockResolvedValue(mockCitizen);

      const result = await service.findByNina('1 19 95 0 10 100 101 A');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCitizen);
      expect(prisma.citizen.findUnique).toHaveBeenCalledWith({
        where: { ninaNumber: '11995010100101A' },
        include: { birthPlace: true, residence: true, parent: true },
      });
    });

    // devrait lever NotFoundException si NINA introuvable
    it('should throw NotFoundException when NINA does not exist', async () => {
      (prisma.citizen.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findByNina('99999999999999Z'))
        .rejects
        .toThrow(NotFoundException);
    });

    // devrait normaliser NINA avant la recherche
    it('should normalize NINA before searching', async () => {
      (prisma.citizen.findUnique as jest.Mock).mockResolvedValue(null);

      try {
        await service.findByNina('1 19 95 0 10 100 101 a');
      } catch {
        // Expected to throw
      }

      expect(prisma.citizen.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ninaNumber: '11995010100101A' },
        }),
      );
    });
  });

  describe('search', () => {
    // devrait retourner des résultats paginés
    it('should return paginated results', async () => {
      const mockCitizens = [
        { id: 'uuid-1', firstName: 'Ibrahim', lastName: 'Keita', },
        { id: 'uuid-2', firstName: 'Amadou', lastName: 'Keita' },
      ];

      (prisma.citizen.findMany as jest.Mock).mockResolvedValue(mockCitizens);
      (prisma.citizen.count as jest.Mock).mockResolvedValue(15);

      const result = await service.search({
        lastName: 'Keita',
        firstName: undefined,
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.meta?.total).toBe(15);
      expect(result.meta?.totalPages).toBe(2);
    });

    // devrait gérer une recherche sans résultat
    it('should handle empty results', async () => {
      (prisma.citizen.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.citizen.count as jest.Mock).mockResolvedValue(0);

      const result = await service.search({
        lastName: 'Inexistant',
        page: 1,
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.meta?.total).toBe(0);
    });
  });
});
