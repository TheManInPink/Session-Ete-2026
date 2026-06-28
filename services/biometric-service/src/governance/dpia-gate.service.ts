/**
 * @file        dpia-gate.service.ts
 * @description GATE DE GOUVERNANCE RGPD/DPIA — BLOQUANT (DPIA §10, doc 25 §1).
 *
 *              ## ⛔ SANS DPIA SIGNÉE PAR LE CISO/DPO CTDEC, AUCUN DÉPLOIEMENT DE
 *              LA BIOMÉTRIE EN PRODUCTION.
 *
 *              Ce n'est pas une recommandation : c'est une CONDITION D'ARRÊT. En
 *              `NODE_ENV=production`, si `BIOMETRIC_DPIA_SIGNED` n'est pas `true`,
 *              le service REFUSE DE DÉMARRER (fail-fast au boot). Hors production,
 *              le service démarre avec un WARNING explicite (le gate reste
 *              « ouvert » tant que la signature CISO/DPO n'est pas apposée).
 *
 *              La base légale NE DÉPEND PAS d'une loi 2024-XX non adoptée (DPIA §2)
 *              : elle repose sur le socle RGPD-équivalent + consentement signé +
 *              cette DPIA formelle signée.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/governance
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

@Injectable()
export class DpiaGateService implements OnModuleInit {
  private readonly logger = new Logger(DpiaGateService.name);
  private readonly dpiaSigned: boolean;
  private readonly isProd: boolean;

  constructor(cfg: ConfigService<Env, true>) {
    this.dpiaSigned = cfg.get('BIOMETRIC_DPIA_SIGNED', { infer: true });
    this.isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';
  }

  /**
   * Évalue le gate au démarrage. Refuse de booter en production sans DPIA signée.
   *
   * @throws Error en production si `BIOMETRIC_DPIA_SIGNED` n'est pas `true`.
   */
  onModuleInit(): void {
    if (this.dpiaSigned) {
      this.logger.log('Gate DPIA : ✅ DPIA signée — déploiement biométrie autorisé.');
      return;
    }
    if (this.isProd) {
      throw new Error(
        '⛔ GATE DE GOUVERNANCE — DPIA biométrie NON SIGNÉE (BIOMETRIC_DPIA_SIGNED!=true). ' +
          'Aucun déploiement de la biométrie en production sans signature CISO/DPO CTDEC ' +
          '(DPIA §10, doc 25 §1). Refus de démarrer.',
      );
    }
    this.logger.warn(
      'Gate DPIA OUVERT (BIOMETRIC_DPIA_SIGNED=false) — toléré en dev/test uniquement. ' +
        'En production, la signature CISO/DPO CTDEC est REQUISE (fail-fast).',
    );
  }

  /** Indique si le gate est franchi (DPIA signée). */
  isOpen(): boolean {
    return this.dpiaSigned;
  }
}
