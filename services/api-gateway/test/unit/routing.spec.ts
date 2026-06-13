/**
 * @file        routing.spec.ts
 * @description Tests de ROUTAGE de bout en bout (boot réel de l'AppModule +
 *              supertest). Vérifie aussi, implicitement, que le catch-all
 *              `@All('*')` BOOTE correctement sous Express 5 / path-to-regexp v8.
 *
 *              Dépendances externes neutralisées par override DI :
 *                - JWT_VERIFIER  → stub (token « valid » accepté, sinon rejeté)
 *                - ProxyService  → stub (capture les appels forward)
 *                - RedisService  → stub (compteur de rate limit contrôlé)
 *                - AggregatorService → stub (renvoie la base sans réseau)
 *
 *              IMPORTANT : un SEUL Nest app est booté pour tout le fichier —
 *              deux instances ré-enregistreraient les métriques Prometheus par
 *              défaut sur le registre global et feraient échouer le 2e init.
 */
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JWT_VERIFIER } from '@nina-aes/auth-guards';
import { AppModule } from '../../src/app.module.js';
import { ProxyService } from '../../src/modules/proxy/proxy.service.js';
import { RedisService } from '../../src/infrastructure/redis/redis.service.js';
import { AggregatorService } from '../../src/modules/aggregator/aggregator.service.js';

describe('api-gateway — routage (e2e)', () => {
  let app: INestApplication;
  const forwardMock = jest.fn();
  /** Compteur renvoyé par le stub Redis (contrôle le rate limiting). */
  let mockCount: number | null = 1;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWT_VERIFIER)
      .useValue({
        verifyAccess: (token: string) => {
          if (token === 'valid') return { userId: 'u1', role: 'citizen', mfa: false };
          throw new UnauthorizedException('AUTH_TOKEN_INVALID');
        },
      })
      .overrideProvider(ProxyService)
      .useValue({ forward: forwardMock })
      .overrideProvider(RedisService)
      .useValue({ ping: async () => true, incrementWindow: async () => mockCount })
      .overrideProvider(AggregatorService)
      .useValue({ getAggregated: async (base: unknown) => base })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    // Mirroir de main.ts : sans ce préfixe, les chemins ne matcheraient pas la
    // table de routage (qui attend /api/v1/...).
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/(.*)', 'metrics'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    mockCount = 1;
    forwardMock.mockReset();
    forwardMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    });
  });

  // ── Surfaces locales (hors proxy) ──────────────────────────────────────
  it('GET /health → 200 liveness', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('GET /api/v1/api-gateway/info → 200 (public)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/api-gateway/info');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('api-gateway');
  });

  it('GET /api/v1/api-gateway/openapi.json → 200 (public, spec agrégée)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/api-gateway/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBeDefined();
  });

  // ── Authentification ───────────────────────────────────────────────────
  it('route protégée SANS token → 401 E_GW_004', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/citizens/123');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('E_GW_004');
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('route protégée avec token INVALIDE → 401 E_GW_004', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/citizens/123')
      .set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('E_GW_004');
    expect(forwardMock).not.toHaveBeenCalled();
  });

  it('endpoint PUBLIC (auth/login) → forward sans token', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ x: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(forwardMock).toHaveBeenCalledTimes(1);
  });

  it('route protégée avec token VALIDE → forward + X-User-Context signé', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/citizens/123')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    expect(forwardMock).toHaveBeenCalledTimes(1);
    const [, payload] = forwardMock.mock.calls[0];
    expect(payload.userId).toBe('u1');
    expect(payload.userRole).toBe('citizen');
    expect(typeof payload.userContextJws).toBe('string');
    expect(payload.userContextJws.length).toBeGreaterThan(10);
  });

  it('purge un X-User-Context usurpé fourni par le client', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-User-Context', 'forged-by-client')
      .send({});
    const [, payload] = forwardMock.mock.calls[0];
    // Endpoint public ⇒ aucune identité ⇒ aucun contexte propagé (le forgé est purgé).
    expect(payload.headers['x-user-context']).toBeUndefined();
    expect(payload.userContextJws).toBeUndefined();
  });

  // ── 404 ────────────────────────────────────────────────────────────────
  it('chemin /api/v1 inconnu → 404 E_GW_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inconnu/x')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('E_GW_NOT_FOUND');
    expect(forwardMock).not.toHaveBeenCalled();
  });

  // ── Introspection protégée ──────────────────────────────────────────────
  it('GET /api/v1/api-gateway/routes SANS token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/api-gateway/routes');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/api-gateway/routes avec token → 200 et 15 routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/api-gateway/routes')
      .set('Authorization', 'Bearer valid');
    expect(res.status).toBe(200);
    // 16 préfixes publics (identity est atteint via /citizens, /corrections,
    // /locations) pour 14 services aval distincts.
    expect(res.body.total).toBe(16);
  });

  // ── Rate limiting ────────────────────────────────────────────────────────
  it('dépassement de quota → 429 E_GW_RATELIMIT', async () => {
    mockCount = 999; // > RATE_LIMIT_MAX (défaut 100)
    const res = await request(app.getHttpServer()).get('/api/v1/api-gateway/info');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('E_GW_RATELIMIT');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('Redis indisponible → fail-open (la requête passe)', async () => {
    mockCount = null; // incrementWindow renvoie null = Redis KO
    const res = await request(app.getHttpServer()).get('/api/v1/api-gateway/info');
    expect(res.status).toBe(200);
  });
});
