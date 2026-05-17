/**
 * @file        citizen.e2e-spec.ts
 * @description Smoke tests E2E pour CitizenController.
 *
 *              Ces tests utilisent un AppModule avec Prisma/Redis/RabbitMQ
 *              mockés au niveau Provider. Pour les vrais tests d'intégration
 *              avec Testcontainers, voir doc 18 §4.4.
 *
 *              Mode NINA_AUTH_MODE=mock pour bypass le RolesGuard.
 *
 * @module      identity-service/test
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { CitizenService } from '../src/modules/citizen/citizen.service';
import { CitizenController } from '../src/modules/citizen/citizen.controller';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../src/infrastructure/redis/redis.service';

describe('CitizenController (e2e smoke)', () => {
  let app: INestApplication;
  const mockCitizenService: Partial<Record<keyof CitizenService, jest.Mock>> = {
    findByNina: jest.fn(),
    search: jest.fn(),
    create: jest.fn(),
  };

  beforeAll(async () => {
    process.env.NINA_AUTH_MODE = 'mock';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CitizenController],
      providers: [
        { provide: CitizenService, useValue: mockCitizenService },
        { provide: Reflector, useValue: new Reflector() },
        RolesGuard,
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), ping: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /citizens/:nina retourne 200 avec le citoyen', async () => {
    mockCitizenService.findByNina!.mockResolvedValue({
      id: 'uuid-1',
      nina: '18903102015042V',
      firstName: 'Mamadou',
    });

    const res = await request(app.getHttpServer()).get('/citizens/18903102015042V').expect(200);
    expect(res.body.nina).toBe('18903102015042V');
    expect(mockCitizenService.findByNina).toHaveBeenCalledWith('18903102015042V');
  });

  it('POST /citizens valide le payload Zod (rejette firstName manquant)', async () => {
    await request(app.getHttpServer())
      .post('/citizens')
      .send({
        nina: '18903102015042V',
        // firstName omis → 400 BadRequest
        lastName: 'Traoré',
      })
      .expect(400);
    expect(mockCitizenService.create).not.toHaveBeenCalled();
  });

  it('POST /citizens accepte un payload valide', async () => {
    mockCitizenService.create!.mockResolvedValue({ id: 'uuid-new', nina: '18903102015042V' });

    await request(app.getHttpServer())
      .post('/citizens')
      .send({
        nina: '18903102015042V',
        firstName: 'Mamadou',
        lastName: 'Traoré',
        sex: 'M',
        birthDate: '1989-03-15',
        birthPlaceCode: 'ML-09-03',
      })
      .expect(201);
    expect(mockCitizenService.create).toHaveBeenCalled();
  });

  it('GET /citizens?search=Mamadu retourne la liste paginée', async () => {
    mockCitizenService.search!.mockResolvedValue({
      data: [{ id: 'uuid-1', nina: '18903102015042V' }],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const res = await request(app.getHttpServer()).get('/citizens?search=Mamadu').expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
  });
});
