/**
 * @file        redis.service.ts
 * @description Wrapper ioredis pour le auth-service.
 *
 *              Toutes les clés sont automatiquement préfixées par
 *              `REDIS_KEY_PREFIX` (`auth:` par défaut) via l'option ioredis
 *              `keyPrefix` — les modules consommateurs n'ont pas à le faire
 *              eux-mêmes (cf. `REDIS_KEYS` dans `common/constants.ts`).
 *
 *              Méthodes haut niveau exposées :
 *                - `set` / `setEx`   — écriture (avec TTL secondes)
 *                - `setNxEx`         — set-if-not-exists avec TTL (atomique)
 *                - `get` / `del`     — lecture / suppression
 *                - `exists`          — existence O(1)
 *                - `incrEx`          — INCR + EXPIRE atomiques (rate limit)
 *
 *              Toutes les opérations renvoient des types stricts ;
 *              `null` distingue clairement « clé absente » de « string vide ».
 *
 * @module      auth-service/redis
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type Redis as RedisClient } from 'ioredis';

import type { AppEnv } from '../config/env.config.js';

/** Token d'injection pour l'instance brute (utile pour les tests). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get('REDIS_URL', { infer: true });
    const keyPrefix = this.config.get('REDIS_KEY_PREFIX', { infer: true });

    this.client = new Redis(url, {
      keyPrefix,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      // Évite que ioredis spamme les logs si Redis tombe — on log via on('error').
      reconnectOnError: () => true,
    });

    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });

    await new Promise<void>((resolve, reject) => {
      this.client!.once('ready', resolve);
      this.client!.once('error', (err) => reject(err));
    });

    this.logger.log(`Redis connecté (prefix='${keyPrefix}')`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /** Définit une valeur (sans TTL). */
  async set(key: string, value: string): Promise<void> {
    await this.raw().set(key, value);
  }

  /** Définit une valeur avec TTL en secondes. */
  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.raw().set(key, value, 'EX', ttlSeconds);
  }

  /**
   * SET if Not eXists avec TTL — atomique. Retourne `true` si la clé a été
   * créée, `false` si elle existait déjà.
   */
  async setNxEx(key: string, ttlSeconds: number, value: string): Promise<boolean> {
    const res = await this.raw().set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  /** Lit une valeur. Retourne `null` si la clé n'existe pas. */
  async get(key: string): Promise<string | null> {
    return this.raw().get(key);
  }

  /** Supprime une ou plusieurs clés. Retourne le nombre de clés effacées. */
  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.raw().del(...keys);
  }

  /** Vérifie l'existence d'une clé en O(1). */
  async exists(key: string): Promise<boolean> {
    return (await this.raw().exists(key)) === 1;
  }

  /**
   * INCR + EXPIRE atomiques via Lua. Si la clé n'existait pas, elle est créée
   * à 1 et le TTL est posé. Si elle existait, son TTL n'est PAS renouvelé
   * (sliding=false) — comportement attendu pour un fenêtrage strict.
   *
   * @returns valeur courante du compteur après incrément.
   */
  async incrEx(key: string, ttlSeconds: number): Promise<number> {
    const lua = `
      local v = redis.call('INCR', KEYS[1])
      if v == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return v
    `;
    const result = (await this.raw().eval(lua, 1, key, ttlSeconds.toString())) as number;
    return result;
  }

  /** Récupère le TTL restant en secondes (−1 = pas de TTL, −2 = absente). */
  async ttl(key: string): Promise<number> {
    return this.raw().ttl(key);
  }

  /**
   * Accès direct au client ioredis pour les opérations avancées (pipelines,
   * multi/exec, scripting). À éviter dans le code applicatif sauf justifié.
   */
  raw(): RedisClient {
    if (!this.client) {
      throw new ServiceUnavailableException('Client Redis non initialisé');
    }
    return this.client;
  }
}
