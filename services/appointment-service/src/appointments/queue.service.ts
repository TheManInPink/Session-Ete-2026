/**
 * @file        queue.service.ts
 * @description File d'attente virtuelle par centre et par jour, sur sorted set
 *              Redis. À l'arrivée (check-in), le citoyen est inséré avec un score
 *              = heure d'arrivée (ms) MOINS un bonus de priorité : les personnes
 *              vulnérables (P1) passent ainsi devant les arrivées standard (P3)
 *              du même jour, sans jamais doubler une file inter-journalière.
 *
 *              Le rang dans le sorted set donne la position et le numéro de
 *              passage. Le temps d'attente estimé est un modèle simple
 *              (placeholder ML, cf. README §ML) : ⌈personnes_devant / guichets⌉ ×
 *              durée_créneau. Un futur modèle (régression sur l'historique réel)
 *              remplacera `estimateWaitMinutes` sans changer l'interface.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */
import { Injectable } from '@nestjs/common';
import { RedisService, type QueueEntry } from '../infrastructure/redis/redis.service.js';
import { utcDateKey } from '../common/time.util.js';
import { PriorityLevel, type PriorityLevel as PriorityLevelT } from './appointment.enums.js';

/** Bonus de score (ms) retranché selon la priorité (P1 le plus avancé). */
const PRIORITY_BONUS_MS: Record<PriorityLevelT, number> = {
  [PriorityLevel.P1]: 86_400_000, // 24 h : garantit P1 devant tout P3 du jour
  [PriorityLevel.P2]: 3_600_000, // 1 h
  [PriorityLevel.P3]: 0,
};

/** TTL d'une file (s) : couvre la journée + marge (purge auto le lendemain). */
const QUEUE_TTL_SECONDS = 36 * 3600;

/** Position d'un citoyen dans la file + estimation d'attente. */
export interface QueuePosition {
  position: number;
  peopleAhead: number;
  queueSize: number;
  estimatedWaitMin: number;
}

@Injectable()
export class QueueService {
  constructor(private readonly redis: RedisService) {}

  /** Clé de la file d'un centre pour le jour d'un RDV. */
  queueKey(centerId: string, day: Date): string {
    return `queue:${centerId}:${utcDateKey(day)}`;
  }

  /**
   * Insère un RDV en file (check-in) avec son score de priorité.
   *
   * @param centerId      centerId (= institutionId).
   * @param day           Jour du RDV (détermine la file).
   * @param appointmentId UUID du RDV.
   * @param arrivalMs     Horodatage d'arrivée (ms epoch).
   * @param priority      Priorité opérationnelle (P1/P2/P3).
   * @returns `true` si l'insertion a réussi, `false` si Redis est indisponible
   *          (l'appelant doit alors traiter le mode dégradé — pas de numéro).
   */
  async enqueue(
    centerId: string,
    day: Date,
    appointmentId: string,
    arrivalMs: number,
    priority: PriorityLevelT,
  ): Promise<boolean> {
    const key = this.queueKey(centerId, day);
    const score = arrivalMs - PRIORITY_BONUS_MS[priority];
    const ok = await this.redis.enqueue(key, appointmentId, score);
    // TTL posé uniquement si l'insertion a réussi (sinon EXPIRE sur clé absente).
    if (ok) await this.redis.expire(key, QUEUE_TTL_SECONDS);
    return ok;
  }

  /** Retire un RDV de la file (clôture / annulation après check-in). */
  async remove(centerId: string, day: Date, appointmentId: string): Promise<void> {
    await this.redis.dequeue(this.queueKey(centerId, day), appointmentId);
  }

  /**
   * Reconstruit la file d'un (centre, jour) depuis la base UNIQUEMENT si elle est
   * absente/vide côté Redis — récupération après un redémarrage de Redis, qui perd
   * les sorted sets. On n'écrase JAMAIS une file déjà peuplée (un simple
   * redémarrage du service ne doit pas clobberer une file vivante).
   *
   * Le score de réinsertion = le numéro de passage persisté (`order`) : il rejoue
   * exactement l'ordre d'origine (rang ⇒ position ⇒ numéro inchangés).
   *
   * @param centerId centerId (= institutionId).
   * @param day      Jour de la file.
   * @param entries  RDV à réinsérer (déjà filtrés/ordonnés par numéro).
   * @returns `true` si la file a été reconstruite, `false` si déjà présente ou rien à faire.
   */
  async rebuildIfEmpty(
    centerId: string,
    day: Date,
    entries: { appointmentId: string; order: number }[],
  ): Promise<boolean> {
    if (entries.length === 0) return false;
    const key = this.queueKey(centerId, day);
    // Garde anti-clobber : si la file existe déjà, on ne touche à rien.
    if ((await this.redis.queueSize(key)) > 0) return false;
    let inserted = 0;
    for (const e of entries) {
      if (await this.redis.enqueue(key, e.appointmentId, e.order)) inserted += 1;
    }
    if (inserted === 0) return false; // Redis indisponible : rien réinséré.
    await this.redis.expire(key, QUEUE_TTL_SECONDS);
    return true;
  }

  /**
   * Position d'un RDV dans la file + attente estimée. `position` = 0 si le RDV
   * n'est pas (ou plus) en file.
   */
  async position(
    centerId: string,
    day: Date,
    appointmentId: string,
    slotDurationMin: number,
    parallelDesks: number,
  ): Promise<QueuePosition> {
    const key = this.queueKey(centerId, day);
    const rank = await this.redis.rank(key, appointmentId);
    const queueSize = await this.redis.queueSize(key);
    if (rank === null) {
      return { position: 0, peopleAhead: 0, queueSize, estimatedWaitMin: 0 };
    }
    return {
      position: rank + 1,
      peopleAhead: rank,
      queueSize,
      estimatedWaitMin: this.estimateWaitMinutes(rank, slotDurationMin, parallelDesks),
    };
  }

  /** Liste ordonnée de la file d'un jour (vue agent). */
  list(centerId: string, day: Date): Promise<QueueEntry[]> {
    return this.redis.listQueue(this.queueKey(centerId, day));
  }

  /**
   * Estimation simple du temps d'attente (placeholder ML) : on suppose
   * `parallelDesks` guichets servant chacun un citoyen par `slotDurationMin`.
   *
   * @param peopleAhead     Personnes devant.
   * @param slotDurationMin Durée d'un passage (min).
   * @param parallelDesks   Guichets en parallèle (≥ 1).
   * @returns Attente estimée en minutes (≥ 0).
   */
  estimateWaitMinutes(peopleAhead: number, slotDurationMin: number, parallelDesks: number): number {
    const desks = Math.max(1, parallelDesks);
    return Math.ceil(peopleAhead / desks) * slotDurationMin;
  }
}
