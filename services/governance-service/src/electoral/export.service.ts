/**
 * @file        export.service.ts
 * @description Génération de l'export delta électoral pour la DGE (Bloc C3).
 *
 *              Pipeline (cf. ELECTIONS-EXPORT-CONTRACT §5/§8) :
 *                1. validation stricte de `since` (ISO-8601 complet) ;
 *                2. quota ATOMIQUE PAR COMPTE (réservation AVANT le stream) ;
 *                3. SELECT delta MINIMISÉ (pseudonyme + géo + statut + dates +
 *                   motif) — JAMAIS de NINA/N°CNI/nom ;
 *                4. CSV DÉTERMINISTE → SHA-256(buf) ;
 *                5. signature RS256 (Vault Transit) d'un MANIFESTE JSON incluant
 *                   le SHA-256 + since + count + exportedBy (anti-rejeu) ;
 *                6. trace DURABLE + audit DGE_EXPORT (qui/quand/fenêtre/nb/sha/IP).
 *
 *              Le contrôleur pose les VRAIS en-têtes HTTP (X-Export-Signature /
 *              -SHA256 / -Count) via `res.setHeader` — PAS le fantôme
 *              `StreamableFile.setMetadata()` (inexistant).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { unparse } from 'papaparse';
import type { GovAuthSubject } from '../auth/auth.types.js';
import { AuditPublisher } from '../audit/audit.publisher.js';
import { JwsSigner } from '../crypto/jws.signer.js';
import type { Env } from '../config/env.schema.js';
import { ElectoralRepository, type VoterDeltaRow } from './electoral.repository.js';
import { ExportQuotaService } from './export-quota.service.js';
import { PseudonymService } from './pseudonym.service.js';

/** Résultat d'un export prêt à streamer + en-têtes d'intégrité. */
export interface ExportResult {
  /** Corps CSV (UTF-8). */
  buffer: Buffer;
  /** SHA-256 hexadécimal du corps. */
  sha256: string;
  /** JWS RS256 du manifeste {sha256, since, count, exportedBy, saltVersion}. */
  signatureJws: string;
  /** Nombre de lignes du delta. */
  count: number;
  /** Nom de fichier suggéré. */
  filename: string;
}

@Injectable()
export class ExportService {
  private readonly exportKey: string;

  constructor(
    private readonly repo: ElectoralRepository,
    private readonly quota: ExportQuotaService,
    private readonly pseudonym: PseudonymService,
    private readonly signer: JwsSigner,
    private readonly audit: AuditPublisher,
    cfg: ConfigService<Env, true>,
  ) {
    this.exportKey = cfg.get('VAULT_ELECTIONS_EXPORT_KEY', { infer: true });
  }

  /**
   * Construit l'export delta DGE. Le quota est réservé AVANT toute lecture/sortie.
   *
   * @param sinceIso Fenêtre `since` (ISO-8601 complet OBLIGATOIRE).
   * @param actor    DGE_OFFICIAL authentifié (acteur = `req.user.id`, anti-IDOR).
   * @param ip       IP source (audit).
   */
  async buildDelta(
    sinceIso: string,
    actor: GovAuthSubject,
    ip?: string | null,
  ): Promise<ExportResult> {
    // 1) `since` doit être un ISO-8601 COMPLET (une date nue retournerait 0 ligne).
    const since = new Date(sinceIso);
    if (Number.isNaN(since.getTime()) || !/\d{4}-\d{2}-\d{2}T/.test(sinceIso)) {
      throw new BadRequestException('since doit être un timestamp ISO-8601 complet');
    }

    // 2) Quota ATOMIQUE PAR COMPTE (lève 429 si dépassé) AVANT de streamer.
    await this.quota.assertWithinDailyQuota(actor.userId);

    // 3) Delta minimisé (jamais de NINA/citizenId).
    const delta = await this.repo.delta(since);

    // 4) CSV déterministe + empreinte d'intégrité.
    const buffer = Buffer.from(this.toCsv(delta), 'utf8');
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // 5) Signature RS256 d'un MANIFESTE JSON (pas du corps entier) — anti-rejeu
    //    via since/count/exportedBy ; intégrité via sha256 transporté DANS le JWS.
    const signatureJws = await this.signer.sign(
      {
        sha256,
        since: sinceIso,
        count: delta.length,
        exportedBy: actor.userId,
        saltVersion: this.pseudonym.currentSaltVersion(),
        exportedAt: new Date().toISOString(),
      },
      this.exportKey,
    );

    // 6) Trace DURABLE + audit DGE_EXPORT (rend un compte compromis détectable).
    await this.audit.recordExport({
      accountId: actor.userId,
      sinceIso,
      rowCount: delta.length,
      sha256,
      saltVersion: this.pseudonym.currentSaltVersion(),
      ipAddress: ip,
    });

    return {
      buffer,
      sha256,
      signatureJws,
      count: delta.length,
      filename: `voter-delta-${sinceIso}.csv`,
    };
  }

  /** Sérialise le delta en CSV DÉTERMINISTE (ordre de colonnes fixe). */
  private toCsv(delta: VoterDeltaRow[]): string {
    const rows = delta.map((r) => ({
      pseudonymousId: r.pseudonymousId,
      region: r.region,
      cercle: r.cercle,
      commune: r.commune ?? '',
      status: r.status,
      registeredAt: r.registeredAt.toISOString(),
      removedAt: r.removedAt ? r.removedAt.toISOString() : '',
      removedReason: r.removedReason ?? '',
    }));
    return unparse(
      {
        fields: [
          'pseudonymousId',
          'region',
          'cercle',
          'commune',
          'status',
          'registeredAt',
          'removedAt',
          'removedReason',
        ],
        data: rows,
      },
      { newline: '\n' },
    );
  }
}
