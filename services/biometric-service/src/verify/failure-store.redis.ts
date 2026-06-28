/**
 * @file        failure-store.redis.ts
 * @description Store PARTAGÉ (Redis) du compteur d'échecs anti-bruteforce du
 *              verify 1:1. Partagé entre TOUS les réplicas du service : c'est ce
 *              qui rend le verrouillage EFFECTIF à la topologie multi-réplicas
 *              ciblée (K3s, doc 25 §2). Un compteur en mémoire (par réplica)
 *              laisserait passer `N × réplicas` essais par fenêtre — le SEUL
 *              contrôle qui rend le seuil τ non contournable par volume (DPIA
 *              §6.5) serait alors inefficace.
 *
 *              ⚠️  FAIL-CLOSED (contrairement au rate-limit best-effort du
 *              gateway). L'anti-bruteforce est un CONTRÔLE DE SÉCURITÉ DUR : si
 *              Redis est indisponible, on NE PEUT PAS garantir l'unicité du
 *              compteur, donc `isLocked` renvoie `true` (refus 403) et
 *              `recordFailure` propage l'indisponibilité — on préfère REFUSER une
 *              vérification que d'ouvrir une fenêtre de bruteforce non comptée.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/verify
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env.schema.js';

/** Erreur signalant l'indisponibilité du store partagé (fail-closed côté appelant). */
export class FailureStoreUnavailableError extends Error {
  constructor() {
    super('FAILURE_STORE_UNAVAILABLE');
    this.name = 'FailureStoreUnavailableError';
  }
}

/**
 * Compteur d'échecs partagé (Redis) avec fenêtre FIXE. La clé porte le couple
 * `(agent, citizen)` ; le TTL (= durée de la fenêtre/verrouillage) est posé à la
 * PREMIÈRE incrémentation, puis la fenêtre expire seule (pas de TTL glissant).
 */
@Injectable()
export class RedisFailureStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisFailureStore.name);
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
    this.client.on('ready', () => this.logger.log('Redis (anti-bruteforce) connecté'));
  }

  /** Ferme proprement la connexion à l'arrêt du service. */
  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => undefined);
  }

  /**
   * Compteur d'échecs courant pour une clé `(agent, citizen)`.
   *
   * @param key Clé de comptage (`failkey(agent, citizen)`).
   * @returns Le nombre d'échecs dans la fenêtre courante (0 si expirée/absente).
   * @throws {FailureStoreUnavailableError} si Redis est indisponible (fail-closed).
   */
  async count(key: string): Promise<number> {
    if (!this.client) throw new FailureStoreUnavailableError();
    try {
      const raw = await this.client.get(key);
      return raw ? Number.parseInt(raw, 10) || 0 : 0;
    } catch (err) {
      this.logger.warn(`count impossible (fail-closed) : ${(err as Error).message}`);
      throw new FailureStoreUnavailableError();
    }
  }

  /**
   * Incrémente ATOMIQUEMENT le compteur d'échecs et pose son TTL lors de la
   * PREMIÈRE incrémentation (fenêtre fixe).
   *
   * @param key        Clé de comptage `(agent, citizen)`.
   * @param ttlSeconds Durée de la fenêtre / du verrouillage.
   * @returns Le compteur après incrément.
   * @throws {FailureStoreUnavailableError} si Redis est indisponible (fail-closed).
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (!this.client) throw new FailureStoreUnavailableError();
    try {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, ttlSeconds);
      return count;
    } catch (err) {
      this.logger.warn(`increment impossible (fail-closed) : ${(err as Error).message}`);
      throw new FailureStoreUnavailableError();
    }
  }

  /**
   * Efface le compteur d'une clé `(agent, citizen)` après un succès (l'agent
   * légitime n'est pas pénalisé). Best-effort : un échec d'effacement laisse au
   * pire le verrou expirer seul (sûr).
   *
   * @param key Clé de comptage `(agent, citizen)`.
   */
  async clear(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key).catch((err: unknown) => {
      this.logger.warn(`clear impossible : ${(err as Error).message}`);
    });
  }
}
