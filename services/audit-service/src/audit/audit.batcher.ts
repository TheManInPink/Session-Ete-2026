/**
 * @file        audit.batcher.ts
 * @description Accumulateur d'écritures : regroupe les événements entrants et
 *              les insère par LOT (perf). Déclencheurs de flush :
 *                - taille atteinte  (AUDIT_BATCH_MAX_SIZE, défaut 1000), OU
 *                - intervalle écoulé (AUDIT_BATCH_INTERVAL_MS, défaut 500 ms).
 *
 *              Les flushes sont SÉRIALISÉS via une chaîne de promesses : jamais
 *              deux `appendMany` concurrents (le chaînage Merkle exige l'ordre).
 *              Chaque message porte ses callbacks `ack`/`nack` AMQP : on
 *              n'acquitte qu'APRÈS commit en base (livraison « at-least-once »).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { AuditService } from './audit.service.js';
import type { NormalizedAuditEvent } from './audit.normalizer.js';

/** Élément de lot : événement + acquittements AMQP différés. */
export interface BatchItem {
  event: NormalizedAuditEvent;
  ack: () => void;
  nack: () => void;
}

@Injectable()
export class AuditBatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditBatcher.name);
  private queue: BatchItem[] = [];
  private timer: NodeJS.Timeout | null = null;
  /** Chaîne de promesses garantissant un seul flush à la fois. */
  private flushChain: Promise<void> = Promise.resolve();
  private readonly maxSize: number;
  private readonly intervalMs: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly auditService: AuditService,
  ) {
    this.maxSize = cfg.get('AUDIT_BATCH_MAX_SIZE', { infer: true });
    this.intervalMs = cfg.get('AUDIT_BATCH_INTERVAL_MS', { infer: true });
  }

  /** Démarre le timer périodique de flush. */
  onModuleInit(): void {
    this.timer = setInterval(() => this.triggerFlush(), this.intervalMs);
    this.timer.unref?.();
  }

  /** Arrête le timer et vide le tampon restant avant l'arrêt du service. */
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.triggerFlush();
    await this.flushChain;
  }

  /** Empile un événement ; flush immédiat si la taille max est atteinte. */
  enqueue(item: BatchItem): void {
    this.queue.push(item);
    if (this.queue.length >= this.maxSize) this.triggerFlush();
  }

  /** Programme un flush sérialisé (jamais concurrent). */
  private triggerFlush(): void {
    this.flushChain = this.flushChain
      .then(() => this.doFlush())
      .catch((err: unknown) => {
        this.logger.error(`flush inattendu : ${(err as Error).message}`);
      });
  }

  /**
   * Vide le tampon courant en une transaction. ACK tous les messages si le
   * commit réussit, NACK (requeue) sinon — on ne perd jamais un événement.
   */
  private async doFlush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      const inserted = await this.auditService.appendMany(batch.map((i) => i.event));
      for (const item of batch) item.ack();
      if (inserted !== batch.length) {
        this.logger.debug(`Lot : ${inserted}/${batch.length} insérés (doublons ignorés)`);
      }
    } catch (err) {
      this.logger.error(
        `Lot d'audit échoué (${batch.length} msg, requeue) : ${(err as Error).message}`,
      );
      for (const item of batch) item.nack();
    }
  }
}
