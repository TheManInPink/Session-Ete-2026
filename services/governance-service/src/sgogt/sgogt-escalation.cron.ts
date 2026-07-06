/**
 * @file        sgogt-escalation.cron.ts
 * @description Cron `@nestjs/schedule` qui balaie toutes les 15 minutes les
 *              messages SGOGT échus (TTL dépassé, non accusés) et les escalade au
 *              supérieur hiérarchique (cf. SGOGT-PROTOCOL §6.3). Désactivable via
 *              `SGOGT_ESCALATION_CRON_ENABLED=false` (test/CI) — le service
 *              `SgogtEscalationService.sweep()` reste appelable manuellement.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/sgogt
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env.schema.js';
import { SgogtEscalationService } from './sgogt-escalation.service.js';

/** Toutes les 15 minutes (cf. SGOGT-PROTOCOL §6.3). */
const ESCALATION_SCHEDULE = '*/15 * * * *';

@Injectable()
export class SgogtEscalationCron {
  private readonly logger = new Logger(SgogtEscalationCron.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly escalation: SgogtEscalationService,
    cfg: ConfigService<Env, true>,
  ) {
    this.enabled = cfg.get('SGOGT_ESCALATION_CRON_ENABLED', { infer: true });
  }

  /** Balayage toutes les 15 minutes. Réentrance protégée (`running`). */
  @Cron(ESCALATION_SCHEDULE)
  async handle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.escalation.sweep();
    } catch (err) {
      this.logger.error(`Échec balayage escalade SGOGT : ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
