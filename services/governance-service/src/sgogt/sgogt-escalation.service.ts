/**
 * @file        sgogt-escalation.service.ts
 * @description Logique d'ESCALADE AUTOMATIQUE des messages SGOGT (Bloc C2).
 *
 *              Si un message reste `SENT` (non accusé) au-delà de son
 *              `ttlEscalateAt` (4 h CRITICAL / 24 h sinon), il remonte d'UN cran
 *              au supérieur hiérarchique du destinataire (`User.manager`).
 *              Chaque escalade émet un événement SIGNÉ (JWS RS256, clé système
 *              Vault) et CHAÎNÉ (SHA-256) → historique NON falsifiable.
 *              L'application est ATOMIQUE et IDEMPOTENTE (updateMany conditionnel
 *              en transaction) : deux passages concurrents du cron n'escaladent
 *              qu'une fois.
 *
 *              Séparée de `SgogtService` pour être testable seule et réutilisable
 *              par le cron (`@nestjs/schedule`).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/sgogt
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import { GENESIS_HASH, sha256Hex } from '../common/crypto.util.js';
import { JwsSigner } from '../crypto/jws.signer.js';
import type { Env } from '../config/env.schema.js';
import { SgogtRepository } from './sgogt.repository.js';

/** Acteur machine pour l'audit (PAS un UUID → ne va pas dans `userId`). */
const SYSTEM_ACTOR = 'system:sgogt-escalation-cron';

/** Lot maximal traité par balayage (anti-rafale / borne mémoire). */
const ESCALATION_BATCH = 200;

@Injectable()
export class SgogtEscalationService {
  private readonly logger = new Logger(SgogtEscalationService.name);
  /** Clé système Vault signant les événements d'escalade. */
  private readonly systemKid: string;

  constructor(
    private readonly repo: SgogtRepository,
    private readonly signer: JwsSigner,
    private readonly audit: AuditPublisher,
    cfg: ConfigService<Env, true>,
  ) {
    // On réutilise la clé d'export (système, non liée à un fonctionnaire) pour
    // sceller l'historique d'escalade : il s'agit d'un acte du SYSTÈME, pas d'un
    // agent — la non-répudiation visée est « le système a escaladé », pas « X a ».
    this.systemKid = cfg.get('VAULT_ELECTIONS_EXPORT_KEY', { infer: true });
  }

  /**
   * Balaie les messages échus et escalade ceux qui ont un supérieur.
   *
   * @param now Horodatage de référence (injectable pour les tests).
   * @returns Nombre de messages effectivement escaladés.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    const due = await this.repo.dueForEscalation(now, ESCALATION_BATCH);
    let escalated = 0;

    for (const msg of due) {
      const managerId = await this.repo.resolveManager(msg.recipientId);
      if (!managerId) {
        // Pas de supérieur (sommet hiérarchique) → on laisse en l'état.
        continue;
      }

      // Événement d'escalade signé + chaîné (historique non falsifiable).
      const at = new Date().toISOString();
      const claims: Record<string, unknown> = {
        eventType: 'SGOGT_ESCALATION',
        messageId: msg.id,
        from: msg.recipientId,
        to: managerId,
        level: 1,
        reason: 'TTL_EXPIRED',
        at,
      };
      const signatureJws = await this.signer.sign(claims, this.systemKid);
      const previousHash = (await this.repo.lastEscalationHash(msg.id)) ?? GENESIS_HASH;
      const chainHash = sha256Hex(`${previousHash}|${signatureJws}|${at}`);

      const applied = await this.repo.applyEscalation({
        messageId: msg.id,
        fromUserId: msg.recipientId,
        toUserId: managerId,
        level: 1,
        signatureJws,
        previousHash,
        chainHash,
      });
      if (!applied) continue; // déjà escaladé par un passage concurrent (idempotence)

      escalated += 1;
      await this.audit.publish({
        action: AuditAction.SGOGT_MESSAGE_ESCALATED,
        entityType: 'SgogtSignedMessage',
        entityId: msg.id,
        actorId: null, // acteur machine → pas un UUID
        actorType: SYSTEM_ACTOR,
        metadata: { from: msg.recipientId, to: managerId, threadId: msg.threadId, level: 1 },
      });
    }

    if (escalated > 0) {
      this.logger.log(`Escalade SGOGT : ${escalated}/${due.length} message(s) escaladé(s).`);
    }
    return escalated;
  }
}
