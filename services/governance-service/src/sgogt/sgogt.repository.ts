/**
 * @file        sgogt.repository.ts
 * @description Accès PostgreSQL aux messages SGOGT signés (`SgogtSignedMessage`)
 *              et à leur historique d'escalade (`SgogtEscalationEvent`) via le
 *              client Prisma partagé. Aucune logique métier ici (pure
 *              persistance) — la signature/vérif vit dans le service.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/sgogt
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  prisma,
  type Prisma,
  type SgogtSignedMessage,
  type SgogtEscalationEvent,
} from '@nina-aes/database';

/** Données de persistance d'un message SGOGT signé. */
export interface PersistMessageData {
  threadId: string;
  senderId: string;
  recipientId: string;
  subject: string;
  body: string;
  bodyHash: string;
  jwsSignature: string;
  signedClaims: Prisma.InputJsonValue;
  signingKid: string;
  priority: 'NORMAL' | 'HIGH' | 'CRITICAL';
  ttlEscalateAt: Date;
  previousChainHash: string;
  chainHash: string;
}

@Injectable()
export class SgogtRepository {
  /** Résout l'`User.id` interne depuis le `sub` Keycloak (claim JWT). */
  async findInternalUserId(keycloakId: string): Promise<string | null> {
    const u = await prisma.user.findUnique({ where: { keycloakId }, select: { id: true } });
    return u?.id ?? null;
  }

  /**
   * Résout STRICTEMENT l'`User.id` interne depuis le `sub` Keycloak. Lève 401 si
   * aucun `User` n'est mappé : on REFUSE de retomber sur le `keycloakId` brut, qui
   * (1) ne correspond à AUCUNE clé Transit `sgogt-user-<User.id>` provisionnée et
   * (2) mélangerait les espaces d'identifiants (keycloakId vs User.id), cassant
   * l'anti-IDOR et le routage des messages. Tous les acteurs SGOGT (émetteur,
   * lecteur, répondeur) DOIVENT vivre dans l'espace `User.id`.
   *
   * @param keycloakId `sub` du JWT vérifié.
   * @throws UnauthorizedException si le mapping keycloakId→User.id est absent.
   */
  async requireInternalUserId(keycloakId: string): Promise<string> {
    const id = await this.findInternalUserId(keycloakId);
    if (!id) throw new UnauthorizedException('SGOGT_USER_NOT_PROVISIONED');
    return id;
  }

  /** Vérifie l'existence d'un destinataire (User.id). */
  async recipientExists(userId: string): Promise<boolean> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    return u !== null;
  }

  /** Dernier `chainHash` d'un fil (pour chaîner le message suivant). */
  async lastChainHashForThread(threadId: string): Promise<string | null> {
    const last = await prisma.sgogtSignedMessage.findFirst({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      select: { chainHash: true },
    });
    return last?.chainHash ?? null;
  }

  /** Persiste un message signé. */
  create(data: PersistMessageData): Promise<SgogtSignedMessage> {
    return prisma.sgogtSignedMessage.create({ data });
  }

  /** Lit un message par id. */
  findById(id: string): Promise<SgogtSignedMessage | null> {
    return prisma.sgogtSignedMessage.findUnique({ where: { id } });
  }

  /** Boîte de réception d'un destinataire (par statut décroissant de date). */
  inbox(recipientId: string, skip: number, take: number): Promise<SgogtSignedMessage[]> {
    return prisma.sgogtSignedMessage.findMany({
      where: { recipientId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  /** Marque un message lu + stocke l'ACK signé (transition SENT→READ). */
  markRead(id: string, readReceiptJws: string): Promise<SgogtSignedMessage> {
    return prisma.sgogtSignedMessage.update({
      where: { id },
      data: { status: 'READ', readAt: new Date(), readReceiptJws },
    });
  }

  /** Marque un message répondu (transition →RESPONDED). */
  markResponded(id: string): Promise<SgogtSignedMessage> {
    return prisma.sgogtSignedMessage.update({
      where: { id },
      data: { status: 'RESPONDED', respondedAt: new Date() },
    });
  }

  /**
   * Messages échus pour escalade : encore `SENT`, TTL dépassé, pas déjà escaladés.
   */
  dueForEscalation(now: Date, take: number): Promise<SgogtSignedMessage[]> {
    return prisma.sgogtSignedMessage.findMany({
      where: { status: 'SENT', ttlEscalateAt: { lte: now }, escalatedToId: null },
      orderBy: { ttlEscalateAt: 'asc' },
      take,
    });
  }

  /** Résout le supérieur hiérarchique d'un destinataire (self-relation User). */
  async resolveManager(recipientId: string): Promise<string | null> {
    const u = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { managerId: true },
    });
    return u?.managerId ?? null;
  }

  /** Dernier `chainHash` de l'historique d'escalade d'un message. */
  async lastEscalationHash(messageId: string): Promise<string | null> {
    const last = await prisma.sgogtEscalationEvent.findFirst({
      where: { messageId },
      orderBy: { createdAt: 'desc' },
      select: { chainHash: true },
    });
    return last?.chainHash ?? null;
  }

  /**
   * Applique une escalade de manière ATOMIQUE : met à jour le message ET insère
   * l'événement signé dans une transaction. Le `updateMany` conditionnel
   * (`escalatedToId: null`) garantit l'idempotence sous concurrence (un seul
   * passage du cron escalade réellement).
   *
   * @returns `true` si l'escalade a été appliquée, `false` si déjà escaladé.
   */
  async applyEscalation(input: {
    messageId: string;
    fromUserId: string;
    toUserId: string;
    level: number;
    signatureJws: string;
    previousHash: string;
    chainHash: string;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.sgogtSignedMessage.updateMany({
        where: { id: input.messageId, status: 'SENT', escalatedToId: null },
        data: { status: 'ESCALATED', escalatedToId: input.toUserId, escalatedAt: new Date() },
      });
      if (updated.count === 0) return false; // déjà escaladé (idempotence)
      await tx.sgogtEscalationEvent.create({
        data: {
          messageId: input.messageId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          level: input.level,
          reason: 'TTL_EXPIRED',
          signatureJws: input.signatureJws,
          previousHash: input.previousHash,
          chainHash: input.chainHash,
        },
      });
      return true;
    });
  }

  /** Historique d'escalade d'un message (chronologique). */
  escalationHistory(messageId: string): Promise<SgogtEscalationEvent[]> {
    return prisma.sgogtEscalationEvent.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
