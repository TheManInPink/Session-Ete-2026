/**
 * @file        redis.service.ts
 * @description Accès Redis (ioredis) de l'appointment-service. Couvre deux
 *              usages :
 *
 *                1. **File d'attente virtuelle** par centre et par jour
 *                   (sorted set) : à l'arrivée (check-in), le citoyen est inséré
 *                   avec un score = heure d'arrivée ajustée d'un bonus de
 *                   priorité (les personnes vulnérables passent devant). Le rang
 *                   dans le sorted set donne la position et le numéro de passage.
 *
 *                2. **Blacklist temporaire no-show** : clé à TTL natif posée
 *                   après dépassement du seuil d'absences ; expire seule.
 *
 *              Tolérant aux pannes : si Redis est indisponible, les opérations
 *              de file dégradent (numéro non attribué) et la vérification de
 *              blacklist échoue **ouvert** (on n'empêche jamais un citoyen de
 *              réserver à cause d'une panne d'infrastructure). Le cœur de la
 *              prise de RDV (PostgreSQL) reste fonctionnel sans Redis.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/infrastructure/redis
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../config/env.schema.js';

/** Une entrée de file : identifiant de RDV + score (heure d'arrivée ajustée). */
export interface QueueEntry {
  appointmentId: string;
  score: number;
}

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

  // ── File d'attente virtuelle (sorted sets) ────────────────────────────

  /**
   * Insère (ou met à jour) un RDV dans la file du jour avec son score.
   * Un score plus FAIBLE = position plus AVANCÉE (priorité aux vulnérables).
   *
   * @returns `true` si l'insertion a réussi, `false` si Redis est indisponible.
   */
  async enqueue(queueKey: string, appointmentId: string, score: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.zadd(queueKey, score, appointmentId);
      return true;
    } catch (err) {
      this.logger.warn(`enqueue impossible (${(err as Error).message})`);
      return false;
    }
  }

  /** Retire un RDV de la file (annulation / clôture). */
  async dequeue(queueKey: string, appointmentId: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.zrem(queueKey, appointmentId);
    } catch (err) {
      this.logger.warn(`dequeue impossible (${(err as Error).message})`);
    }
  }

  /**
   * Rang (0-based) d'un RDV dans la file ⇒ nombre de personnes devant lui.
   *
   * @returns Le rang, ou `null` si absent / Redis indisponible.
   */
  async rank(queueKey: string, appointmentId: string): Promise<number | null> {
    if (!this.client) return null;
    try {
      const r = await this.client.zrank(queueKey, appointmentId);
      return r === null ? null : r;
    } catch (err) {
      this.logger.warn(`rank impossible (${(err as Error).message})`);
      return null;
    }
  }

  /** Nombre de RDV actuellement en file. */
  async queueSize(queueKey: string): Promise<number> {
    if (!this.client) return 0;
    try {
      return await this.client.zcard(queueKey);
    } catch (err) {
      this.logger.warn(`queueSize impossible (${(err as Error).message})`);
      return 0;
    }
  }

  /** Liste ordonnée de la file (du premier au dernier servi), avec scores. */
  async listQueue(queueKey: string): Promise<QueueEntry[]> {
    if (!this.client) return [];
    try {
      const flat = await this.client.zrange(queueKey, 0, -1, 'WITHSCORES');
      const out: QueueEntry[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        out.push({ appointmentId: flat[i]!, score: Number(flat[i + 1]) });
      }
      return out;
    } catch (err) {
      this.logger.warn(`listQueue impossible (${(err as Error).message})`);
      return [];
    }
  }

  /**
   * Pose un TTL sur la clé de file (expiration auto après la fin de journée),
   * pour éviter l'accumulation de sorted sets périmés.
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (err) {
      this.logger.warn(`expire impossible (${(err as Error).message})`);
    }
  }

  // ── Blacklist temporaire no-show ──────────────────────────────────────

  /** Pose une blacklist avec TTL natif (expire seule). */
  async setBlacklist(key: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, '1', 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`setBlacklist impossible (${(err as Error).message})`);
    }
  }

  /**
   * Indique si une clé de blacklist est active. Échoue **ouvert** : en cas de
   * panne Redis, renvoie `false` (on ne bloque jamais une réservation pour une
   * raison d'infrastructure).
   */
  async isBlacklisted(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.exists(key)) === 1;
    } catch (err) {
      this.logger.warn(`isBlacklisted impossible (fail-open) : ${(err as Error).message}`);
      return false;
    }
  }

  /** TTL restant (secondes) d'une blacklist ; `-2` = absente, `-1` = sans expiration. */
  async ttl(key: string): Promise<number> {
    if (!this.client) return -2;
    try {
      return await this.client.ttl(key);
    } catch (err) {
      this.logger.warn(`ttl impossible (${(err as Error).message})`);
      return -2;
    }
  }

  // ── Santé ─────────────────────────────────────────────────────────────

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
