/**
 * @file        audit.service.ts
 * @description Cœur métier de l'audit immuable : append chaîné (Merkle),
 *              vérification d'intégrité, preuve d'inclusion, export signé,
 *              scellement de racine.
 *
 *              ── Intégrité du chaînage sous concurrence ──
 *              Deux chemins écrivent dans la chaîne : l'ingestion AMQP (batch)
 *              et l'endpoint POST /audit (unitaire). Pour empêcher tout « fork »
 *              de la chaîne (deux transactions lisant le même `previousHash`),
 *              CHAQUE transaction d'append acquiert d'abord un VERROU CONSULTATIF
 *              transactionnel PostgreSQL (`pg_advisory_xact_lock`) — global au
 *              cluster, relâché automatiquement au COMMIT/ROLLBACK. Le chaînage
 *              est donc strictement sérialisé, même multi-instances.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable, Logger } from '@nestjs/common';
import { prisma, Prisma, type AuditLog, type PrismaClient } from '@nina-aes/database';
import { HashService } from './hash.service.js';
import { SigningService } from './signing.service.js';
import { AuditLogRepository, type AuditQuery } from './audit-log.repository.js';
import type { AuditChainFields } from './chain.js';
import type { NormalizedAuditEvent } from './audit.normalizer.js';

/** Clé du verrou consultatif global de la chaîne d'audit (arbitraire, fixe). */
const CHAIN_ADVISORY_LOCK = 461_542;

/** Plafond d'export pour éviter d'épuiser la mémoire sur un export géant. */
const MAX_EXPORT_ROWS = 50_000;

/** Résultat d'une vérification d'intégrité d'intervalle. */
export interface VerifyResult {
  valid: boolean;
  entriesChecked: number;
  brokenAt?: string;
  reason?: 'payload_tampered' | 'merkle_mismatch';
  expectedHash?: string;
  actualHash?: string;
}

/** Représentation JSON-safe d'un log (BigInt → string). */
export interface SerializedAuditLog extends Omit<AuditLog, 'id'> {
  id: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly hash: HashService,
    private readonly signing: SigningService,
    private readonly repo: AuditLogRepository,
  ) {}

  // ── Écriture chaînée ──────────────────────────────────────────────────────

  /**
   * Ajoute UN événement (chemin synchrone POST /audit). Idempotent.
   *
   * @returns Le log créé (ou existant si `sourceEventId` déjà vu) + `duplicate`.
   */
  async appendOne(event: NormalizedAuditEvent): Promise<{ log: AuditLog; duplicate: boolean }> {
    // Cast vers le client de base : le client étendu ($extends soft-delete)
    // perturbe l'inférence de la transaction interactive (overload tableau
    // sélectionné par erreur). Sûr : même objet runtime, on n'utilise que des
    // méthodes du client de base. L'extension soft-delete ne touche pas AuditLog.
    return (prisma as unknown as PrismaClient).$transaction(async (tx) => {
      const existing = await tx.auditLog.findUnique({
        where: { sourceEventId: event.sourceEventId },
      });
      if (existing) return { log: existing, duplicate: true };

      const prev = await this.lockChainAndGetPrev(tx);
      const { data } = this.buildRow(prev, event);
      const log = await tx.auditLog.create({ data: data as Prisma.AuditLogUncheckedCreateInput });
      return { log, duplicate: false };
    });
  }

  /**
   * Ajoute un LOT d'événements (chemin batch AMQP) dans une seule transaction.
   * Déduplique (idempotence) avant de chaîner. Insertion groupée `createMany`.
   *
   * @returns Nombre d'entrées réellement insérées (hors doublons).
   */
  async appendMany(events: NormalizedAuditEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    return (prisma as unknown as PrismaClient).$transaction(async (tx) => {
      let prev = await this.lockChainAndGetPrev(tx);

      const ids = events.map((e) => e.sourceEventId);
      const existing = await tx.auditLog.findMany({
        where: { sourceEventId: { in: ids } },
        select: { sourceEventId: true },
      });
      const taken = new Set(existing.map((r) => r.sourceEventId));

      const rows: Prisma.AuditLogCreateManyInput[] = [];
      for (const e of events) {
        if (taken.has(e.sourceEventId)) continue; // doublon (déjà en base OU déjà dans ce lot)
        taken.add(e.sourceEventId);
        const { data, merkleHash } = this.buildRow(prev, e);
        rows.push(data);
        prev = merkleHash;
      }
      if (rows.length === 0) return 0;
      await tx.auditLog.createMany({ data: rows });
      return rows.length;
    });
  }

  /**
   * Acquiert le verrou consultatif global puis lit le `merkleHash` du dernier
   * log (ou GENESIS). À n'appeler qu'à l'intérieur d'une transaction.
   */
  private async lockChainAndGetPrev(tx: Prisma.TransactionClient): Promise<string> {
    // `::bigint` : force la surcharge pg_advisory_xact_lock(bigint) quel que soit
    // le type sous lequel le driver lie le paramètre numérique.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${CHAIN_ADVISORY_LOCK}::bigint)`;
    const rows = await tx.$queryRaw<Array<{ merkle_hash: string }>>`
      SELECT merkle_hash FROM audit_logs ORDER BY id DESC LIMIT 1
    `;
    return rows[0]?.merkle_hash ?? this.hash.genesis;
  }

  /** Construit la ligne d'insertion + son `merkleHash` à partir du hash précédent. */
  private buildRow(
    previousHash: string,
    e: NormalizedAuditEvent,
  ): { data: Prisma.AuditLogCreateManyInput; merkleHash: string } {
    const payloadHash = this.hash.payloadHash(e);
    const merkleHash = this.hash.merkleHash({
      previousHash,
      payloadHash,
      occurredAt: e.occurredAt,
      sourceEventId: e.sourceEventId,
    });
    const data: Prisma.AuditLogCreateManyInput = {
      userId: e.userId,
      actorType: e.actorType,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      oldValue: (e.oldValue == null
        ? Prisma.DbNull
        : e.oldValue) as Prisma.AuditLogCreateManyInput['oldValue'],
      newValue: (e.newValue == null
        ? Prisma.DbNull
        : e.newValue) as Prisma.AuditLogCreateManyInput['newValue'],
      ipAddress: e.ipAddress,
      payloadHash,
      previousHash,
      merkleHash,
      sourceEventId: e.sourceEventId,
      correlationId: e.correlationId,
      occurredAt: e.occurredAt,
    };
    return { data, merkleHash };
  }

  // ── Vérification ──────────────────────────────────────────────────────────

  /**
   * Recalcule la chaîne sur [fromId, toId] et la compare aux valeurs stockées.
   * Détecte toute altération de payload ou de chaînage.
   */
  async verifyRange(fromId: bigint, toId: bigint): Promise<VerifyResult> {
    const logs = await this.repo.findByIdRange(fromId, toId);
    if (logs.length === 0) return { valid: true, entriesChecked: 0 };

    let expectedPrev = logs[0]!.previousHash;
    let checked = 0;
    for (const log of logs) {
      const fields = this.rowToChainFields(log);
      const payloadHash = this.hash.payloadHash(fields);
      if (payloadHash !== log.payloadHash) {
        return {
          valid: false,
          entriesChecked: checked,
          brokenAt: log.id.toString(),
          reason: 'payload_tampered',
          expectedHash: payloadHash,
          actualHash: log.payloadHash,
        };
      }
      const merkle = this.hash.merkleHash({
        previousHash: expectedPrev,
        payloadHash,
        occurredAt: log.occurredAt,
        sourceEventId: log.sourceEventId,
      });
      if (merkle !== log.merkleHash) {
        return {
          valid: false,
          entriesChecked: checked,
          brokenAt: log.id.toString(),
          reason: 'merkle_mismatch',
          expectedHash: merkle,
          actualHash: log.merkleHash,
        };
      }
      expectedPrev = log.merkleHash;
      checked++;
    }
    return { valid: true, entriesChecked: checked };
  }

  /** Reconstruit les champs hashés (`AuditChainFields`) depuis une ligne DB. */
  private rowToChainFields(log: AuditLog): AuditChainFields {
    return {
      userId: log.userId,
      actorType: log.actorType,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValue: log.oldValue ?? null,
      newValue: log.newValue ?? null,
      ipAddress: log.ipAddress,
      correlationId: log.correlationId,
      sourceEventId: log.sourceEventId,
    };
  }

  // ── Preuve / lecture ──────────────────────────────────────────────────────

  /** Lit un log par id (sérialisé). */
  async findById(id: bigint): Promise<SerializedAuditLog | null> {
    const log = await this.repo.findById(id);
    return log ? this.serialize(log) : null;
  }

  /** Recherche paginée filtrée (sérialisée). */
  async list(
    q: AuditQuery,
  ): Promise<{ data: SerializedAuditLog[]; total: number; skip: number; take: number }> {
    const { data, total } = await this.repo.findFiltered(q);
    return { data: data.map((l) => this.serialize(l)), total, skip: q.skip, take: q.take };
  }

  /**
   * Preuve cryptographique d'un log : le log + la chaîne jusqu'à la racine
   * scellée la plus proche + cette racine signée Ed25519.
   *
   * Exposition (CANON ADR-007) :
   *  - `signingKeyId` + `publicKeyEd25519` au niveau racine de la réponse :
   *    permet à un tiers (inspecteur OCLEI/Vérificateur Général) de REJOUER la
   *    vérification offline (§11) avec la BONNE clé, même après une rotation
   *    Vault (il choisit la clé d'archive correspondant à `signingKeyId`).
   *  - `signatureValid` : résultat de la VÉRIFICATION SERVEUR de la signature
   *    Ed25519 de la racine. L'API ne renvoie jamais une preuve dont la
   *    signature serait silencieusement invalide (détection précoce d'une clé
   *    désynchronisée ou d'une racine corrompue).
   *
   * Honnêteté (ADR-007 §5.2) : la hash-chain est LINÉAIRE (pas un arbre de
   * Merkle) ; l'intégrité n'est juridiquement opposable qu'avec un ANCRAGE TIERS
   * de la racine — ⏳ Phase 2 (`externalAnchor` ci-dessous, `publishedExternal`
   * dans `audit_roots`). `signatureValid=null` si la racine a été signée par une
   * clé antérieure à une rotation (clé d'époque non chargée en mémoire) :
   * l'inspecteur tranche alors via le script offline §11 avec la clé d'archive.
   */
  async getProof(logId: bigint) {
    const log = await this.repo.findById(logId);
    if (!log) return null;
    const root = await this.repo.findRootCoveringLog(logId);
    const chain = root ? await this.repo.findByIdRange(logId, root.lastLogId) : [log];

    // Vérification serveur de la signature Ed25519 de la racine couvrante.
    // Message signé = `${chainRootHash}|${signedAt.toISOString()}` (cohérent
    // avec sealRoot). Si la clé courante en mémoire ne correspond pas à celle
    // d'époque (rotation), on renvoie `null` plutôt qu'un faux négatif.
    let signatureValid: boolean | null = null;
    if (root) {
      const message = `${root.chainRootHash}|${root.signedAt.toISOString()}`;
      signatureValid =
        root.signingKeyId === this.signing.getKeyId()
          ? await this.signing.verify(message, root.signature)
          : null;
    }

    return {
      log: this.serialize(log),
      chain: chain.map((l) => ({
        id: l.id.toString(),
        previousHash: l.previousHash,
        merkleHash: l.merkleHash,
      })),
      root: root
        ? {
            chainRootHash: root.chainRootHash,
            lastLogId: root.lastLogId.toString(),
            logCountCovered: root.logCountCovered,
            signedAt: root.signedAt,
            signature: root.signature,
            signingKeyId: root.signingKeyId,
            publicKey: this.signing.getPublicKeyHex(),
          }
        : null,
      // Matériel de vérification indépendante (rejouable offline §11).
      signingKeyId: root?.signingKeyId ?? null,
      publicKeyEd25519: this.signing.getPublicKeyHex(),
      signatureValid,
      // ⏳ Phase 2 : `externalAnchor` (preuve d'ancrage OCLEI/Vérificateur Général).
    };
  }

  /** Dernière racine scellée (sérialisée) + clé publique courante. */
  async latestRoot() {
    const root = await this.repo.latestRoot();
    if (!root) return null;
    return {
      id: root.id.toString(),
      chainRootHash: root.chainRootHash,
      lastLogId: root.lastLogId.toString(),
      logCountCovered: root.logCountCovered,
      signature: root.signature,
      signingKeyId: root.signingKeyId,
      signedAt: root.signedAt,
      publicKey: this.signing.getPublicKeyHex(),
    };
  }

  // ── Export signé ──────────────────────────────────────────────────────────

  /**
   * Exporte les logs filtrés en CSV + signature détachée Ed25519 du CSV.
   *
   * @returns `{ csv, signature, signingKeyId, publicKey, rowCount, truncated }`.
   */
  async exportCsv(q: Omit<AuditQuery, 'skip' | 'take'>): Promise<{
    csv: string;
    signature: string;
    signingKeyId: string;
    publicKey: string;
    rowCount: number;
    truncated: boolean;
  }> {
    const { data } = await this.repo.findFiltered({ ...q, skip: 0, take: MAX_EXPORT_ROWS });
    const truncated = data.length === MAX_EXPORT_ROWS;
    if (truncated) {
      this.logger.warn(
        `Export tronqué à ${MAX_EXPORT_ROWS} lignes — affiner les filtres (from/to) pour un export complet.`,
      );
    }
    const csv = this.toCsv(data);
    const signature = await this.signing.sign(csv);
    return {
      csv,
      signature,
      signingKeyId: this.signing.getKeyId(),
      publicKey: this.signing.getPublicKeyHex(),
      rowCount: data.length,
      truncated,
    };
  }

  /** Sérialise un jeu de logs en CSV (RFC 4180, champs JSON échappés). */
  private toCsv(logs: AuditLog[]): string {
    const header = [
      'id',
      'occurred_at',
      'created_at',
      'actor_type',
      'user_id',
      'action',
      'entity_type',
      'entity_id',
      'ip_address',
      'correlation_id',
      'source_event_id',
      'payload_hash',
      'previous_hash',
      'merkle_hash',
      'old_value',
      'new_value',
    ];
    const esc = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = logs.map((l) =>
      [
        l.id.toString(),
        l.occurredAt.toISOString(),
        l.createdAt.toISOString(),
        l.actorType,
        l.userId,
        l.action,
        l.entityType,
        l.entityId,
        l.ipAddress,
        l.correlationId,
        l.sourceEventId,
        l.payloadHash,
        l.previousHash,
        l.merkleHash,
        l.oldValue,
        l.newValue,
      ]
        .map(esc)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n');
  }

  // ── Scellement de racine ──────────────────────────────────────────────────

  /**
   * Scelle la racine courante : signe `chainRootHash|signedAt` (Ed25519) et
   * persiste une `AuditRoot`. Appelé par le cron horaire (ou manuellement).
   *
   * @returns La racine créée, ou `null` si la chaîne est vide.
   */
  async sealRoot(): Promise<{ id: string; chainRootHash: string; lastLogId: string } | null> {
    const last = await this.repo.findLast();
    if (!last) {
      this.logger.warn('Aucun log à sceller');
      return null;
    }
    const signedAt = new Date();
    const message = `${last.merkleHash}|${signedAt.toISOString()}`;
    const signature = await this.signing.sign(message);
    const logCount = await this.repo.countLogs();

    const root = await this.repo.createRoot({
      chainRootHash: last.merkleHash,
      lastLogId: last.id,
      logCountCovered: logCount,
      signature,
      signingKeyId: this.signing.getKeyId(),
    });
    this.logger.log(
      `Racine scellée #${root.id} root=${last.merkleHash.slice(0, 16)}… logs=${logCount} keyId=${this.signing.getKeyId()}`,
    );
    return {
      id: root.id.toString(),
      chainRootHash: root.chainRootHash,
      lastLogId: root.lastLogId.toString(),
    };
  }

  /** Convertit une ligne Prisma en objet JSON-safe (BigInt → string). */
  private serialize(log: AuditLog): SerializedAuditLog {
    return { ...log, id: log.id.toString() };
  }
}
