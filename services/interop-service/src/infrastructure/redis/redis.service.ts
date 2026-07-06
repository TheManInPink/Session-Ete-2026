/**
 * @file        redis.service.ts
 * @description Accès Redis (ioredis) de l'interop-service. Couvre deux usages de
 *              SÉCURITÉ, tous deux FAIL-CLOSED (à l'inverse de la file d'attente
 *              best-effort de l'appointment-service) :
 *
 *                1. **Anti-replay** : `setReplayGuard` pose `SET key NX PX` —
 *                   atomique, refuse un `jti` déjà vu. Si Redis est injoignable,
 *                   on LÈVE une erreur (le caller refuse la requête, 503).
 *
 *                2. **Rate-limit glissant par pays** : `slidingWindowCount`
 *                   exécute une pipeline `ZREMRANGEBYSCORE`/`ZADD`/`ZCARD`/
 *                   `EXPIRE` et renvoie le compteur. En cas de panne Redis, on
 *                   LÈVE une erreur (le guard refuse, 503) — jamais de fail-open
 *                   qui laisserait pulvériser le quota contractuel.
 *
 *              Distinction clé vs appointment-service : ici une panne Redis ne
 *              doit JAMAIS ouvrir une faille (replay accepté / quota contourné).
 *              Les méthodes propagent donc l'erreur au lieu de la dégrader.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/infrastructure/redis
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../config/env.schema.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly url: string;
  private readonly keyPrefix: string;
  private client: Redis | null = null;

  constructor(cfg: ConfigService<Env, true>) {
    this.url = cfg.get('REDIS_URL', { infer: true });
    this.keyPrefix = cfg.get('REDIS_KEY_PREFIX', { infer: true });
  }

  /** Ouvre la connexion (ioredis applique `keyPrefix` à TOUTES les commandes). */
  onModuleInit(): void {
    this.client = new Redis(this.url, {
      keyPrefix: this.keyPrefix,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      reconnectOnError: () => true,
    });
    this.client.on('error', (err) => this.logger.warn(`Redis error : ${err.message}`));
    this.client.on('ready', () => this.logger.log('Redis connecté'));
  }

  /** Ferme proprement la connexion à l'arrêt du service. */
  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => undefined);
  }

  /**
   * ANTI-REPLAY (fail-CLOSED). Pose la clé `key` seulement si elle est ABSENTE
   * (`SET … NX`) avec un TTL en millisecondes (`PX`). Opération ATOMIQUE : pas
   * de race read-then-write.
   *
   * @param key       Clé de garde (ex. `replay:<jti>`).
   * @param value     Valeur associée (ex. le requestId, pour le debug).
   * @param ttlMs     Durée de vie de la garde (ms).
   * @returns `true` si la clé a été posée (jti jamais vu), `false` si elle
   *          existait déjà (replay détecté).
   * @throws Error si Redis est indisponible — le caller DOIT alors refuser (503).
   */
  async setReplayGuard(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (!this.client) throw new Error('Redis indisponible (replay store)');
    const res = await this.client.set(key, value, 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  /**
   * RATE-LIMIT glissant (fail-CLOSED). Insère l'occurrence courante dans un
   * sorted set par pays, purge les entrées hors fenêtre, et renvoie le nombre
   * de requêtes restantes dans la fenêtre. La pipeline est inspectée commande
   * par commande pour détecter une erreur partielle.
   *
   * @param key      Clé du sorted set (ex. `ratelimit:<country>`).
   * @param member   Membre unique de l'occurrence (ex. `<now>:<uuid>`).
   * @param nowMs    Horodatage courant (ms).
   * @param windowMs Largeur de la fenêtre glissante (ms).
   * @param ttlSec   TTL du sorted set (s) — typiquement la fenêtre.
   * @returns Le nombre d'occurrences dans la fenêtre (compteur courant inclus).
   * @throws Error si Redis est indisponible — le guard DOIT alors refuser (503).
   */
  async slidingWindowCount(
    key: string,
    member: string,
    nowMs: number,
    windowMs: number,
    ttlSec: number,
  ): Promise<number> {
    if (!this.client) throw new Error('Redis indisponible (rate-limit store)');
    const pipe = this.client.pipeline();
    pipe.zremrangebyscore(key, 0, nowMs - windowMs);
    pipe.zadd(key, nowMs, member);
    pipe.zcard(key);
    pipe.expire(key, ttlSec);
    const res = (await pipe.exec()) ?? [];
    // Détecte une erreur par-commande dans la pipeline (res[i][0] = error).
    for (const entry of res) {
      if (entry?.[0]) throw entry[0];
    }
    const countRaw = res?.[2]?.[1];
    if (typeof countRaw !== 'number') {
      throw new Error('Rate-limit : ZCARD a renvoyé une valeur inattendue');
    }
    return countRaw;
  }

  /** Test rapide de connectivité (utilisé par /health). */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
