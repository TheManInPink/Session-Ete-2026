/**
 * @file        inscription.cron.ts
 * @description Cron quotidien d'inscription électorale automatique à 18 ans
 *              (02:00 Africa/Bamako, cf. doc 22 §4.4 — fuseau Bamako pour ne pas
 *              rater de citoyens à cheval UTC/Bamako). Désactivable via
 *              `ELECTIONS_INSCRIPTION_CRON_ENABLED=false` (test/CI).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../config/env.schema.js';
import { InscriptionService } from './inscription.service.js';

/** 02:00 chaque jour. */
const INSCRIPTION_SCHEDULE = '0 2 * * *';

@Injectable()
export class InscriptionCron {
  private readonly logger = new Logger(InscriptionCron.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly inscription: InscriptionService,
    cfg: ConfigService<Env, true>,
  ) {
    this.enabled = cfg.get('ELECTIONS_INSCRIPTION_CRON_ENABLED', { infer: true });
  }

  /** Inscription quotidienne 02:00 Africa/Bamako. Réentrance protégée. */
  @Cron(INSCRIPTION_SCHEDULE, { timeZone: 'Africa/Bamako' })
  async handle(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.inscription.inscribeNewAdults();
    } catch (err) {
      this.logger.error(`Échec inscription auto 18 ans : ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
