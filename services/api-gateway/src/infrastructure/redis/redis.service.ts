/**
 * @file        redis.service.ts
 * @description Accès Redis (ioredis) de l'api-gateway. Usage unique : support
 *              du **rate limiting distribué** (compteur de fenêtre glissante
 *              partagé entre toutes les instances du gateway).
 *
 *              POURQUOI REDIS et pas un compteur en mémoire : derrière un
 *              load-balancer, N pods de gateway tournent en parallèle. Un
 *              compteur local n'observe qu'1/N du trafic ⇒ la limite réelle
 *              serait N× trop permissive. Redis centralise le décompte.
 *
 *              Tolérant aux pannes : si Redis est indisponible, `incrementWindow`
 *              renvoie `null` et le guard **échoue ouvert** (fail-open) — on ne
 *              bloque jamais le trafic légitime à cause d'une panne d'infra. Le
 *              rate limiting est une protection best-effort, pas un contrôle de
 *              sécurité dur.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/infrastructure/redis
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
      maxRetriesPerRequest: 3,
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
   * Incrémente ATOMIQUEMENT le compteur d'une fenêtre de rate limiting et pose
   * son TTL lors de la PREMIÈRE incrémentation (la fenêtre expire alors seule).
   *
   * Implémentation `INCR` + `EXPIRE (si compteur == 1)` : on ne ré-arme PAS le
   * TTL à chaque appel, sinon la fenêtre « glisserait » indéfiniment tant que le
   * trafic continue et ne se réinitialiserait jamais (fenêtre fixe, pas mobile).
   *
   * @param key Clé de la fenêtre (ex. `rl:u:<userId>:<windowStart>`).
   * @param ttlSeconds Durée de vie de la fenêtre.
   * @returns Le compteur après incrément, ou `null` si Redis est indisponible
   *          (le guard interprète `null` comme « laisser passer » / fail-open).
   */
  async incrementWindow(key: string, ttlSeconds: number): Promise<number | null> {
    if (!this.client) return null;
    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    } catch (err) {
      this.logger.warn(`incrementWindow impossible (fail-open) : ${(err as Error).message}`);
      return null;
    }
  }

  /** Test rapide de connectivité (utilisé par /health/ready). */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
