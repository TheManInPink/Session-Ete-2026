/**
 * @file        queue.spec.ts
 * @description Tests de la file d'attente virtuelle : ordonnancement par
 *              priorité (score), position, estimation d'attente.
 * @module      appointment-service/test
 */
import { QueueService } from '../../src/appointments/queue.service.js';
import type { RedisService } from '../../src/infrastructure/redis/redis.service.js';
import { PriorityLevel } from '../../src/appointments/appointment.enums.js';

/** Faux Redis : sorted set en mémoire (rang = index par score croissant). */
class FakeRedis {
  private readonly sets = new Map<string, Map<string, number>>();

  enqueue(key: string, member: string, score: number): Promise<boolean> {
    const set = this.sets.get(key) ?? new Map<string, number>();
    set.set(member, score);
    this.sets.set(key, set);
    return Promise.resolve(true);
  }
  dequeue(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member);
    return Promise.resolve();
  }
  rankAndSize(key: string, member: string): Promise<{ rank: number | null; size: number }> {
    const ordered = this.ordered(key);
    const idx = ordered.indexOf(member);
    return Promise.resolve({ rank: idx === -1 ? null : idx, size: ordered.length });
  }
  queueSize(key: string): Promise<number> {
    return Promise.resolve(this.sets.get(key)?.size ?? 0);
  }
  expire(): Promise<void> {
    return Promise.resolve();
  }
  scoreOf(key: string, member: string): number | undefined {
    return this.sets.get(key)?.get(member);
  }
  private ordered(key: string): string[] {
    return [...(this.sets.get(key) ?? new Map())].sort((a, b) => a[1] - b[1]).map(([m]) => m);
  }
}

describe('QueueService', () => {
  const day = new Date('2026-06-08T00:00:00Z');
  const center = 'center-1';

  function make() {
    const redis = new FakeRedis();
    const queue = new QueueService(redis as unknown as RedisService);
    return { redis, queue };
  }

  it('place une arrivée P1 devant une arrivée P3 antérieure (priorité)', async () => {
    const { redis, queue } = make();
    const arrival = 1_000_000_000_000;
    // P3 arrivé EN PREMIER, P1 arrivé APRÈS : P1 doit néanmoins passer devant.
    await queue.enqueue(center, day, 'p3', arrival, PriorityLevel.P3);
    await queue.enqueue(center, day, 'p1', arrival + 60_000, PriorityLevel.P1);

    const key = queue.queueKey(center, day);
    expect(redis.scoreOf(key, 'p1')!).toBeLessThan(redis.scoreOf(key, 'p3')!);

    const posP1 = await queue.position(center, day, 'p1', 15, 1);
    const posP3 = await queue.position(center, day, 'p3', 15, 1);
    expect(posP1.position).toBe(1);
    expect(posP3.position).toBe(2);
  });

  it('retourne position 0 pour un RDV absent de la file', async () => {
    const { queue } = make();
    const pos = await queue.position(center, day, 'ghost', 15, 2);
    expect(pos.position).toBe(0);
    expect(pos.peopleAhead).toBe(0);
  });

  it('position() fait UN SEUL aller-retour via rankAndSize (pas 2 commandes séparées)', async () => {
    // Ce test verrouille l'absence de régression « double appel » côté QueueService.
    // L'atomicité réelle du MULTI/EXEC (parsing du tuple, rang 0, exec null, erreur
    // par-commande) est couverte directement dans redis.service.spec.ts.
    const { redis, queue } = make();
    await queue.enqueue(center, day, 'a', 1, PriorityLevel.P3);
    await queue.enqueue(center, day, 'b', 2, PriorityLevel.P3);
    const spy = jest.spyOn(redis, 'rankAndSize');
    const pos = await queue.position(center, day, 'b', 15, 1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(pos.position).toBe(2);
    expect(pos.queueSize).toBe(2);
  });

  it('estime l’attente selon le nombre de guichets parallèles', () => {
    const { queue } = make();
    // 5 personnes devant, 15 min/créneau, 2 guichets ⇒ ⌈5/2⌉ × 15 = 45 min.
    expect(queue.estimateWaitMinutes(5, 15, 2)).toBe(45);
    // 0 personne devant ⇒ 0 min.
    expect(queue.estimateWaitMinutes(0, 15, 2)).toBe(0);
    // garde-fou : au moins 1 guichet même si 0 fourni.
    expect(queue.estimateWaitMinutes(3, 10, 0)).toBe(30);
  });

  it('retire un RDV de la file (clôture / annulation)', async () => {
    const { queue } = make();
    await queue.enqueue(center, day, 'a', 1, PriorityLevel.P3);
    await queue.enqueue(center, day, 'b', 2, PriorityLevel.P3);
    await queue.remove(center, day, 'a');
    const pos = await queue.position(center, day, 'b', 15, 1);
    expect(pos.position).toBe(1); // 'b' remonte en tête après retrait de 'a'
  });

  describe('rebuildIfEmpty (récupération après redémarrage de Redis)', () => {
    it('reconstruit une file vide depuis la base en préservant l’ordre (score = numéro)', async () => {
      const { redis, queue } = make();
      const ok = await queue.rebuildIfEmpty(center, day, [
        { appointmentId: 'a', order: 1 },
        { appointmentId: 'b', order: 2 },
        { appointmentId: 'c', order: 3 },
      ]);
      expect(ok).toBe(true);
      const key = queue.queueKey(center, day);
      expect(redis.scoreOf(key, 'a')).toBe(1);
      expect(redis.scoreOf(key, 'c')).toBe(3);
      // L'ordre/les numéros d'origine sont rejoués.
      expect((await queue.position(center, day, 'a', 15, 1)).position).toBe(1);
      expect((await queue.position(center, day, 'c', 15, 1)).position).toBe(3);
    });

    it('NE clobber PAS une file déjà peuplée (no-op si Redis intact)', async () => {
      const { redis, queue } = make();
      await queue.enqueue(center, day, 'live', 999, PriorityLevel.P3);
      const ok = await queue.rebuildIfEmpty(center, day, [{ appointmentId: 'stale', order: 1 }]);
      expect(ok).toBe(false);
      const key = queue.queueKey(center, day);
      expect(redis.scoreOf(key, 'stale')).toBeUndefined(); // pas réinséré
      expect(redis.scoreOf(key, 'live')).toBe(999); // file vivante intacte (P3 ⇒ bonus 0)
    });

    it('ne fait rien si aucune entrée à reconstruire', async () => {
      const { queue } = make();
      expect(await queue.rebuildIfEmpty(center, day, [])).toBe(false);
    });
  });
});
