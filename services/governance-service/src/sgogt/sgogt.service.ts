/**
 * @file        sgogt.service.ts
 * @description Cœur métier de la messagerie officielle SGOGT (Bloc C2).
 *
 *              Invariants de sécurité (cf. SGOGT-PROTOCOL.md) :
 *
 *                1. SIGNATURE JWS RS256 (Vault Transit, clé par-fonctionnaire NON
 *                   exportable) couvrant TOUTE la décision : sender, recipient,
 *                   subject, bodyHash (SHA-256 du corps), threadId, priority,
 *                   ttlEscalateAt, iat → NON-RÉPUDIATION + anti-altération +
 *                   anti-rejeu. Les champs dérivés (threadId/iat/ttl) sont
 *                   calculés AVANT signature pour être couverts.
 *
 *                2. VÉRIFICATION à la réception : refus strict `alg != RS256`,
 *                   `kid` == `sgogt-user-<senderId>`, signature valide,
 *                   cohérence claims signés ↔ colonnes persistées (anti-altération
 *                   DB), bodyHash signé ↔ body stocké.
 *
 *                3. ACCUSÉ DE RÉCEPTION SIGNÉ par le LECTEUR (sa propre clé Transit)
 *                   → le destinataire ne peut pas nier avoir lu.
 *
 *                4. HASH-CHAIN SHA-256 LINÉAIRE par fil (`chainHash`) — PAS un
 *                   arbre de Merkle (CANON). L'intégrité long terme reste portée
 *                   par la hash-chain d'audit-service.
 *
 *                5. ANTI-IDOR : on ne fait JAMAIS confiance à un `senderId` fourni
 *                   par le client — l'émetteur est toujours `req.user` résolu
 *                   STRICTEMENT en `User.id` (401 si non provisionné, JAMAIS de
 *                   fallback sur le `keycloakId` brut). Tous les acteurs vivent
 *                   donc dans l'espace `User.id`, garantissant que
 *                   `kid=sgogt-user-<User.id>` pointe une clé Transit réelle et
 *                   que les comparaisons d'identité sont homogènes. Un
 *                   destinataire ne lit/répond QU'À ses messages.
 *
 *              Le NINA n'apparaît PAS ici (messages institutionnels entre agents).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/sgogt
 */
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Prisma, SgogtSignedMessage } from '@nina-aes/database';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import type { GovAuthSubject } from '../auth/auth.types.js';
import { GENESIS_HASH, sha256Hex } from '../common/crypto.util.js';
import { JwsSigner } from '../crypto/jws.signer.js';
import type { Env } from '../config/env.schema.js';
import type { SendMessageDto, RespondMessageDto } from './dto/sgogt.schema.js';
import { SgogtRepository } from './sgogt.repository.js';

/** Vue publique d'un message (jamais le JWS brut superflu côté liste). */
export interface MessageView {
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  subject: string;
  body: string;
  priority: string;
  status: string;
  ttlEscalateAt: string;
  escalatedToId: string | null;
  readAt: string | null;
  respondedAt: string | null;
  jwsSignature: string;
  chainHash: string;
  createdAt: string;
}

/** Claims signés couvrant la décision administrative (cf. §3.2). */
interface SgogtClaims extends Record<string, unknown> {
  sender: string;
  recipient: string;
  subject: string;
  bodyHash: string;
  threadId: string;
  priority: string;
  ttlEscalateAt: string;
  iat: string;
}

@Injectable()
export class SgogtService {
  private readonly logger = new Logger(SgogtService.name);
  private readonly kidPrefix: string;
  private readonly ttlNormalH: number;
  private readonly ttlCriticalH: number;

  constructor(
    private readonly repo: SgogtRepository,
    private readonly signer: JwsSigner,
    private readonly audit: AuditPublisher,
    cfg: ConfigService<Env, true>,
  ) {
    this.kidPrefix = cfg.get('VAULT_SGOGT_KEY_PREFIX', { infer: true });
    this.ttlNormalH = cfg.get('SGOGT_TTL_NORMAL_HOURS', { infer: true });
    this.ttlCriticalH = cfg.get('SGOGT_TTL_CRITICAL_HOURS', { infer: true });
  }

  /** `kid` Transit de la clé d'un fonctionnaire. */
  private kidFor(userId: string): string {
    return `${this.kidPrefix}${userId}`;
  }

  /** Délai d'escalade dérivé de la priorité (CRITICAL court, sinon long). */
  private ttlFor(priority: string, from: Date): Date {
    const hours = priority === 'CRITICAL' ? this.ttlCriticalH : this.ttlNormalH;
    return new Date(from.getTime() + hours * 3_600_000);
  }

  /**
   * Émet un message officiel SIGNÉ.
   *
   * @param dto   Données validées (Zod).
   * @param actor Sujet authentifié (émetteur réel — jamais le client).
   * @param ip    IP source (audit).
   */
  async send(dto: SendMessageDto, actor: GovAuthSubject, ip?: string | null): Promise<MessageView> {
    // 1) Identité émettrice = utilisateur authentifié résolu STRICTEMENT en
    //    User.id interne. On NE fait JAMAIS confiance à un senderId fourni
    //    (anti-usurpation) ET on REFUSE (401) un sub non provisionné : sinon le
    //    `kid=sgogt-user-<keycloakId>` ne correspondrait à aucune clé Transit.
    const senderId = await this.repo.requireInternalUserId(actor.userId);

    // 2) Destinataire existant (et différent de l'émetteur).
    if (dto.recipientId === senderId) {
      throw new ForbiddenException('SGOGT_SELF_MESSAGE_FORBIDDEN');
    }
    if (!(await this.repo.recipientExists(dto.recipientId))) {
      throw new NotFoundException('Destinataire introuvable');
    }

    // 3) Champs dérivés AVANT signature (donc couverts/immuables).
    const threadId = dto.threadId ?? randomUUID();
    const issuedAt = new Date();
    const ttlEscalateAt = this.ttlFor(dto.priority, issuedAt);
    const bodyHash = sha256Hex(dto.body);

    // 4) Claims signés = la décision administrative entière.
    const claims: SgogtClaims = {
      sender: senderId,
      recipient: dto.recipientId,
      subject: dto.subject,
      bodyHash,
      threadId,
      priority: dto.priority,
      ttlEscalateAt: ttlEscalateAt.toISOString(),
      iat: issuedAt.toISOString(),
    };

    // 5) Signature JWS RS256 — clé par-fonctionnaire DANS Vault (non exportable).
    const kid = this.kidFor(senderId);
    const jws = await this.signer.sign(claims, kid);

    // 6) Maillon de hash-chain SHA-256 LINÉAIRE du fil (PAS Merkle).
    const previousChainHash = (await this.repo.lastChainHashForThread(threadId)) ?? GENESIS_HASH;
    const chainHash = sha256Hex(
      `${previousChainHash}|${bodyHash}|${jws}|${issuedAt.toISOString()}`,
    );

    // 7) Persistance.
    const msg = await this.repo.create({
      threadId,
      senderId,
      recipientId: dto.recipientId,
      subject: dto.subject,
      body: dto.body,
      bodyHash,
      jwsSignature: jws,
      signedClaims: claims as unknown as Prisma.InputJsonValue,
      signingKid: kid,
      priority: dto.priority,
      ttlEscalateAt,
      previousChainHash,
      chainHash,
    });

    // 8) Audit (métadonnées de décision SANS body en clair).
    await this.audit.publish({
      action: AuditAction.SGOGT_MESSAGE_SENT,
      entityType: 'SgogtSignedMessage',
      entityId: msg.id,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { recipient: dto.recipientId, priority: dto.priority, threadId },
    });

    return this.toView(msg);
  }

  /**
   * Vérifie cryptographiquement un message stocké (signature + cohérence
   * claims↔colonnes + bodyHash↔body). Utilisable par le destinataire ou un
   * contrôle a posteriori (Vérificateur Général).
   *
   * @returns `true` si TOUT concorde.
   * @throws UnauthorizedException sur `alg`/`kid` invalide (anti-confusion).
   */
  async verify(messageId: string): Promise<boolean> {
    const msg = await this.repo.findById(messageId);
    if (!msg) throw new NotFoundException('Message introuvable');

    const expectedKid = this.kidFor(msg.senderId);
    const signatureValid = await this.signer.verify(msg.jwsSignature, expectedKid);
    if (!signatureValid) return false;

    // Cohérence claims signés ↔ colonnes persistées (anti-altération DB).
    const claims = msg.signedClaims as unknown as Partial<SgogtClaims>;
    if (
      claims.recipient !== msg.recipientId ||
      claims.priority !== msg.priority ||
      claims.threadId !== msg.threadId ||
      claims.ttlEscalateAt !== msg.ttlEscalateAt.toISOString() ||
      claims.sender !== msg.senderId
    ) {
      return false;
    }
    // Intégrité du corps : hash signé == body stocké.
    return claims.bodyHash === sha256Hex(msg.body);
  }

  /**
   * Boîte de réception du destinataire authentifié (anti-IDOR : son User.id).
   */
  async inbox(actor: GovAuthSubject, page: number, pageSize: number): Promise<MessageView[]> {
    const recipientId = await this.repo.requireInternalUserId(actor.userId);
    const p = Math.max(1, page);
    const ps = Math.min(100, Math.max(1, pageSize));
    const recs = await this.repo.inbox(recipientId, (p - 1) * ps, ps);
    return recs.map((r) => this.toView(r));
  }

  /**
   * Accuse réception d'un message (ACK SIGNÉ par le LECTEUR). Anti-IDOR : seul le
   * destinataire peut acquitter. Vérifie d'abord la signature de l'émetteur
   * (on n'accuse pas réception d'un message forgé).
   *
   * @returns Le message mis à jour (READ) + l'ACK JWS.
   */
  async acknowledge(
    messageId: string,
    actor: GovAuthSubject,
    ip?: string | null,
  ): Promise<{ message: MessageView; ackJws: string }> {
    const reader = await this.repo.requireInternalUserId(actor.userId);
    const msg = await this.repo.findById(messageId);
    if (!msg) throw new NotFoundException('Message introuvable');
    if (msg.recipientId !== reader) {
      throw new ForbiddenException('SGOGT_NOT_RECIPIENT'); // anti-IDOR
    }

    // Vérifie la signature de l'émetteur AVANT d'accuser réception.
    const ok = await this.signer.verify(msg.jwsSignature, this.kidFor(msg.senderId));
    if (!ok) throw new UnauthorizedException('SGOGT_SIGNATURE_INVALID');

    // ACK signé avec la clé du LECTEUR (non-répudiation de réception).
    const ackClaims: Record<string, unknown> = {
      ackType: 'SGOGT_READ_RECEIPT',
      messageId: msg.id,
      threadId: msg.threadId,
      messageJwsHash: sha256Hex(msg.jwsSignature),
      reader,
      readAt: new Date().toISOString(),
    };
    const ackJws = await this.signer.sign(ackClaims, this.kidFor(reader));
    const updated = await this.repo.markRead(msg.id, ackJws);

    await this.audit.publish({
      action: AuditAction.SGOGT_MESSAGE_READ,
      entityType: 'SgogtSignedMessage',
      entityId: msg.id,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { threadId: msg.threadId },
    });

    return { message: this.toView(updated), ackJws };
  }

  /**
   * Répond à un message (clôt la décision : statut RESPONDED). Anti-IDOR : seul
   * le destinataire répond. La réponse elle-même est un NOUVEAU message signé du
   * même fil (chaîne la décision).
   */
  async respond(
    messageId: string,
    dto: RespondMessageDto,
    actor: GovAuthSubject,
    ip?: string | null,
  ): Promise<MessageView> {
    const responder = await this.repo.requireInternalUserId(actor.userId);
    const original = await this.repo.findById(messageId);
    if (!original) throw new NotFoundException('Message introuvable');
    if (original.recipientId !== responder) {
      throw new ForbiddenException('SGOGT_NOT_RECIPIENT'); // anti-IDOR
    }

    // La réponse est un message signé du même fil, adressé à l'émetteur initial.
    const reply = await this.send(
      {
        recipientId: original.senderId,
        subject: `RE: ${original.subject}`.slice(0, 300),
        body: dto.body,
        priority: original.priority as 'NORMAL' | 'HIGH' | 'CRITICAL',
        threadId: original.threadId,
      },
      actor,
      ip,
    );

    await this.repo.markResponded(original.id);
    await this.audit.publish({
      action: AuditAction.SGOGT_MESSAGE_RESPONDED,
      entityType: 'SgogtSignedMessage',
      entityId: original.id,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { threadId: original.threadId, replyId: reply.id },
    });
    return reply;
  }

  /** Projette une ligne en vue publique. */
  private toView(m: SgogtSignedMessage): MessageView {
    return {
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId,
      recipientId: m.recipientId,
      subject: m.subject,
      body: m.body,
      priority: m.priority,
      status: m.status,
      ttlEscalateAt: m.ttlEscalateAt.toISOString(),
      escalatedToId: m.escalatedToId,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      respondedAt: m.respondedAt ? m.respondedAt.toISOString() : null,
      jwsSignature: m.jwsSignature,
      chainHash: m.chainHash,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
