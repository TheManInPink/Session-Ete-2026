import { Test, TestingModule } from '@nestjs/testing';
import { CitizenController } from '../src/modules/citizen/citizen.controller';
import { CitizenService } from '../src/modules/citizen/citizen.service';

describe('CitizenController', () => {
  let controller: CitizenController;
  let service: CitizenService;

  const mockCitizenService = {
    findByNina: jest.fn(),
    search: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CitizenController],
      providers: [
        { provide: CitizenService, useValue: mockCitizenService },
      ],
    }).compile();

    controller = module.get<CitizenController>(CitizenController);
    service = module.get<CitizenService>(CitizenService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findByNina', () => {
    it('should call service.findByNina with the correct parameter', async () => {
      const expected = { success: true, data: { ninaNumber: '11995010100101A' } };
      mockCitizenService.findByNina.mockResolvedValue(expected);

      const result = await controller.findByNina('11995010100101A');

      expect(result).toEqual(expected);
      expect(service.findByNina).toHaveBeenCalledWith('11995010100101A');
    });
  });

  describe('search', () => {
    it('should call service.search with query parameters', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockCitizenService.search.mockResolvedValue(expected);

      const result = await controller.search('Keita', undefined, 1, 20);

      expect(result).toEqual(expected);
      expect(service.search).toHaveBeenCalledWith({
        lastName: 'Keita',
        firstName: undefined,
        page: 1,
        limit: 20,
      });
    });
  });
});
