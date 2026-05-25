/**
 * @file        app.e2e-spec.ts
 * @description Smoke e2e du auth-service.
 *
 *              Ce fichier vérifie le câblage HTTP minimal sans dépendre
 *              de l'infra externe (Keycloak, Vault, Redis, Postgres). On
 *              monte uniquement l'AppController (qui est `@Public()`) et
 *              on vérifie le contrat de probe santé + l'application du
 *              prefix `api/v1` avec exclusions.
 *
 *              Les flows métier complets (register/login/MFA/reset)
 *              seront ajoutés quand un environnement Docker e2e dédié
 *              sera disponible (cf. doc 18 § stratégie tests).
 */

import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppController } from '../src/app.controller.js';

describe('auth-service (e2e smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: '.well-known/jwks.json', method: RequestMethod.GET },
      ],
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health → 200 (hors prefix api/v1)', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'auth-service' });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('GET /api/v1/health → 404 (le prefix exclut explicitement /health)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(404);
  });
});
