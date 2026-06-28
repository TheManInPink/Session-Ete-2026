/**
 * @file        export-quota.service.ts
 * @description Quota d'export DGE PAR COMPTE et PAR JOUR — la VRAIE garantie
 *              anti-exfiltration (le throttler `@nestjs/throttler` ne borne que
 *              PAR IP, contournable en changeant d'IP). Cf.
 *              ELECTIONS-EXPORT-CONTRACT §7.2.
 *
 *              ⚠️ ATOMICITÉ OBLIGATOIRE : l'incrément est une RÉSERVATION en UNE
 *              opération SQL conditionnelle (`UPDATE … WHERE count < limit
 *              RETURNING`) AVANT le stream, JAMAIS un read-then-act dérivé d'un
 *              comptage `audit_logs` (sinon TOCTOU : deux exports concurrents
 *              passent le check avant qu'aucun n'écrive, et le cap est défait).
 *
 *              Implémentation : `INSERT … ON CONFLICT … DO UPDATE SET count =
 *              count + 1 WHERE quota.count < :limit RETURNING count`. Si la ligne
 *              existe déjà au plafond, la clause `WHERE` du DO UPDATE empêche
 *              l'incrément → `RETURNING` ne renvoie aucune ligne → 429.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma, Prisma } from '@nina-aes/database';
import type { Env } from '../config/env.schema.js';

@Injectable()
export class ExportQuotaService {
  private readonly dailyLimit: number;

  constructor(cfg: ConfigService<Env, true>) {
    this.dailyLimit = cfg.get('DGE_EXPORT_DAILY_QUOTA', { infer: true });
  }

  /** Jour courant en UTC (`YYYY-MM-DD`). */
  private today(now: Date): string {
    return now.toISOString().slice(0, 10);
  }

  /**
   * Réserve UN export pour `accountId` aujourd'hui, de manière ATOMIQUE. Lève
   * 429 si le plafond quotidien est atteint. Doit être appelé AVANT de streamer.
   *
   * @param accountId Compte DGE (sub JWT vérifié).
   * @param now       Horodatage (injectable pour les tests).
   * @returns Le compteur APRÈS incrément (≤ limite).
   * @throws HttpException 429 si le quota est dépassé.
   */
  async assertWithinDailyQuota(accountId: string, now: Date = new Date()): Promise<number> {
    const day = this.today(now);

    // Upsert atomique : insère à 1 si absent, sinon incrémente SI count < limit.
    // Le `WHERE dge_export_quota.count < limit` du DO UPDATE bloque le dépassement.
    const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      INSERT INTO dge_export_quota (account_id, day, count, updated_at)
      VALUES (${accountId}, ${day}, 1, NOW())
      ON CONFLICT (account_id, day) DO UPDATE
        SET count = dge_export_quota.count + 1, updated_at = NOW()
        WHERE dge_export_quota.count < ${this.dailyLimit}
      RETURNING count
    `);

    if (rows.length === 0 || rows[0] === undefined) {
      // Aucune ligne renvoyée ⇒ la clause WHERE a bloqué l'incrément ⇒ plafond.
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Quota d'export DGE dépassé (${this.dailyLimit}/jour pour ce compte).`,
          error: 'DGE_EXPORT_QUOTA_EXCEEDED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return rows[0].count;
  }
}
