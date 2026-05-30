/**
 * @file        audit-log.repository.ts
 * @description Accès lecture (et création de racines) sur PostgreSQL via le
 *              client Prisma partagé `@nina-aes/database`.
 *
 *              Les écritures CHAÎNÉES (append) ne passent PAS par ce repository
 *              mais par `AuditService` qui les exécute dans une transaction
 *              `prisma.$transaction` afin de verrouiller la dernière ligne
 *              (`FOR UPDATE`) et garantir l'ordre du chaînage Merkle.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable } from '@nestjs/common';
import { prisma, Prisma, type AuditLog, type AuditRoot } from '@nina-aes/database';

/** Filtres de recherche paginée. */
export interface AuditQuery {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

@Injectable()
export class AuditLogRepository {
  /** Récupère un log par son id. */
  findById(id: bigint): Promise<AuditLog | null> {
    return prisma.auditLog.findUnique({ where: { id } });
  }

  /** Récupère les logs d'un intervalle d'ids [fromId, toId], ordre croissant. */
  findByIdRange(fromId: bigint, toId: bigint): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { id: { gte: fromId, lte: toId } },
      orderBy: { id: 'asc' },
    });
  }

  /** Dernier log inséré (pour le scellement de racine). */
  findLast(): Promise<AuditLog | null> {
    return prisma.auditLog.findFirst({ orderBy: { id: 'desc' } });
  }

  /** Nombre total de logs (cumulatif, pour `logCountCovered`). */
  countLogs(): Promise<number> {
    return prisma.auditLog.count();
  }

  /** Recherche paginée filtrée + total. */
  async findFiltered(q: AuditQuery): Promise<{ data: AuditLog[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.from || q.to
        ? {
            occurredAt: {
              ...(q.from ? { gte: q.from } : {}),
              ...(q.to ? { lte: q.to } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, skip: q.skip, take: q.take, orderBy: { id: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);
    return { data, total };
  }

  // ── Racines scellées ────────────────────────────────────────────────────

  /** Dernière racine scellée. */
  latestRoot(): Promise<AuditRoot | null> {
    return prisma.auditRoot.findFirst({ orderBy: { id: 'desc' } });
  }

  /** Première racine couvrant un log donné (preuve d'inclusion). */
  findRootCoveringLog(logId: bigint): Promise<AuditRoot | null> {
    return prisma.auditRoot.findFirst({
      where: { lastLogId: { gte: logId } },
      orderBy: { lastLogId: 'asc' },
    });
  }

  /** Insère une nouvelle racine scellée. */
  createRoot(data: {
    chainRootHash: string;
    lastLogId: bigint;
    logCountCovered: number;
    signature: string;
    signingKeyId: string;
  }): Promise<AuditRoot> {
    return prisma.auditRoot.create({ data });
  }
}
