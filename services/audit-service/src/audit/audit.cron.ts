/**
 * @file        audit.cron.ts
 * @description Scellement horaire de la racine de chaîne (ancrage temporel
 *              Ed25519). Désactivable via `AUDIT_SEAL_ENABLED=false` (tests/CI).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env.schema.js';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditCron {
  private readonly logger = new Logger(AuditCron.name);
  private readonly enabled: boolean;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly auditService: AuditService,
  ) {
    this.enabled = cfg.get('AUDIT_SEAL_ENABLED', { infer: true });
  }

  /** Scelle la racine toutes les heures. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'audit-seal-root' })
  async sealHourly(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.auditService.sealRoot();
    } catch (err) {
      this.logger.error(`Scellement de racine échoué : ${(err as Error).message}`);
    }
  }
}
