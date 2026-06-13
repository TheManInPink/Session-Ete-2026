/**
 * @file        redis.service.spec.ts
 * @description Tests directs de RedisService.rankAndSize : on pilote un faux
 *              client ioredis dont `multi().zrank().zcard().exec()` renvoie la
 *              forme réelle `[[errRank, rankVal], [errSize, sizeVal]] | null`,
 *              pour valider le PARSING du tuple (et non la réimplémentation
 *              mémoire du FakeRedis de queue.spec.ts) : rang 0 préservé, membre
 *              absent (zrank null), MULTI avorté (exec null), erreur par-commande
 *              (tuple [Error]) et échec total (exec throw / pas de client).
 * @module      appointment-service/test
 */
import { RedisService } from '../../src/infrastructure/redis/redis.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.schema.js';

/** ConfigService minimal (URL + préfixe) — aucune connexion réelle n'est ouverte. */
const cfg = {
  get: (k: string) => (k === 'REDIS_URL' ? 'redis://127.0.0.1:6379' : 'test:'),
} as unknown as ConfigService<Env, true>;

/**
 * Faux client ioredis : `multi()` renvoie une chaîne `zrank().zcard().exec()` où
 * `exec()` résout (ou rejette) la valeur fournie. Reproduit la sémantique de
 * `wrapMultiResult` (tableau de tuples `[err, val]`, ou `null` si MULTI avorté).
 */
function clientReturning(execResult: unknown): unknown {
  const chain = {
    zrank: () => chain,
    zcard: () => chain,
    exec: () => Promise.resolve(execResult),
  };
  return { multi: () => chain };
}

/** Faux client dont `exec()` REJETTE (panne de connexion en cours de transaction). */
function clientThrowing(): unknown {
  const chain = {
    zrank: () => chain,
    zcard: () => chain,
    exec: () => Promise.reject(new Error('connexion perdue')),
  };
  return { multi: () => chain };
}

/** Construit un RedisService et injecte un faux client (sans onModuleInit ⇒ pas de vraie connexion). */
function withClient(client: unknown): RedisService {
  const svc = new RedisService(cfg);
  (svc as unknown as { client: unknown }).client = client;
  return svc;
}

describe('RedisService.rankAndSize (parsing MULTI/EXEC)', () => {
  it('rang 0 PRÉSERVÉ (premier de file) ⇒ rank:0, pas null', async () => {
    const svc = withClient(
      clientReturning([
        [null, 0],
        [null, 5],
      ]),
    );
    expect(await svc.rankAndSize('queue:k', 'a')).toEqual({ rank: 0, size: 5 });
  });

  it('membre absent (zrank ⇒ null) ⇒ rank:null mais taille conservée', async () => {
    const svc = withClient(
      clientReturning([
        [null, null],
        [null, 3],
      ]),
    );
    expect(await svc.rankAndSize('queue:k', 'ghost')).toEqual({ rank: null, size: 3 });
  });

  it('rang quelconque + taille lus depuis le bon index du tuple', async () => {
    const svc = withClient(
      clientReturning([
        [null, 4],
        [null, 10],
      ]),
    );
    expect(await svc.rankAndSize('queue:k', 'x')).toEqual({ rank: 4, size: 10 });
  });

  it('MULTI avorté (exec ⇒ null) ⇒ dégradation douce {rank:null, size:0}', async () => {
    const svc = withClient(clientReturning(null));
    expect(await svc.rankAndSize('queue:k', 'a')).toEqual({ rank: null, size: 0 });
  });

  it('erreur par-commande (tuple [Error]) ⇒ valeur ignorée, pas d’exception', async () => {
    // zrank en erreur (res[0]=[Error], donc res[0][1]===undefined) mais zcard OK.
    const svc = withClient(clientReturning([[new Error('WRONGTYPE')], [null, 7]]));
    expect(await svc.rankAndSize('queue:k', 'a')).toEqual({ rank: null, size: 7 });
  });

  it('exec() rejette (panne connexion) ⇒ fail-open {rank:null, size:0}', async () => {
    const svc = withClient(clientThrowing());
    expect(await svc.rankAndSize('queue:k', 'a')).toEqual({ rank: null, size: 0 });
  });

  it('aucun client (Redis non connecté) ⇒ fail-open {rank:null, size:0}', async () => {
    const svc = withClient(null);
    expect(await svc.rankAndSize('queue:k', 'a')).toEqual({ rank: null, size: 0 });
  });
});
