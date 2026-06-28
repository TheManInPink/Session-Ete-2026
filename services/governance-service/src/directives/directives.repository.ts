/**
 * @file        directives.repository.ts
 * @description Accès PostgreSQL aux directives Kanban (`GovernanceTask`) et à
 *              leur historique de transitions (`GovernanceTaskEvent`).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/directives
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { prisma, type GovernanceTask } from '@nina-aes/database';
import type { TaskStatus } from './directive.state-machine.js';

/** Données de création d'une directive. */
export interface CreateTaskData {
  title: string;
  description: string;
  priority: 'NORMAL' | 'HIGH' | 'CRITICAL';
  createdById: string;
  assigneeId?: string | null;
  deadline?: Date | null;
}

@Injectable()
export class DirectivesRepository {
  /** Résout l'`User.id` interne depuis le `sub` Keycloak (claim JWT). */
  async findInternalUserId(keycloakId: string): Promise<string | null> {
    const u = await prisma.user.findUnique({ where: { keycloakId }, select: { id: true } });
    return u?.id ?? null;
  }

  /**
   * Résout STRICTEMENT l'`User.id` interne. Lève 401 si le `sub` n'est mappé à
   * aucun `User` : on REFUSE de retomber sur le `keycloakId` brut, qui
   * mélangerait les espaces d'identifiants et fausserait les comparaisons
   * d'autorisation (créateur/assignee) côté transitions.
   *
   * @param keycloakId `sub` du JWT vérifié.
   * @throws UnauthorizedException si le mapping keycloakId→User.id est absent.
   */
  async requireInternalUserId(keycloakId: string): Promise<string> {
    const id = await this.findInternalUserId(keycloakId);
    if (!id) throw new UnauthorizedException('DIRECTIVE_USER_NOT_PROVISIONED');
    return id;
  }

  /** Vérifie l'existence d'un assignee. */
  async userExists(userId: string): Promise<boolean> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    return u !== null;
  }

  /** Crée une directive (DRAFT) + son événement de création (transition initiale). */
  async create(data: CreateTaskData): Promise<GovernanceTask> {
    return prisma.$transaction(async (tx) => {
      const task = await tx.governanceTask.create({
        data: {
          title: data.title,
          description: data.description,
          priority: data.priority,
          createdById: data.createdById,
          assigneeId: data.assigneeId ?? null,
          deadline: data.deadline ?? null,
          status: 'DRAFT',
        },
      });
      await tx.governanceTaskEvent.create({
        data: {
          taskId: task.id,
          fromStatus: null,
          toStatus: 'DRAFT',
          actorId: data.createdById,
          note: 'created',
        },
      });
      return task;
    });
  }

  /** Lit une directive par id. */
  findById(id: string): Promise<GovernanceTask | null> {
    return prisma.governanceTask.findUnique({ where: { id } });
  }

  /** Liste les directives par statut (vue colonne Kanban). */
  listByStatus(
    status: TaskStatus | undefined,
    skip: number,
    take: number,
  ): Promise<GovernanceTask[]> {
    return prisma.governanceTask.findMany({
      where: { ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    });
  }

  /**
   * Applique une transition de cycle de vie de manière ATOMIQUE (update du
   * statut + insertion de l'événement d'historique en transaction). Le
   * `updateMany` conditionnel sur `status: from` garantit qu'une transition
   * concurrente ne s'applique pas deux fois.
   *
   * @returns La directive mise à jour, ou `null` si l'état avait déjà changé.
   */
  async transition(input: {
    id: string;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
    actorId: string;
    note?: string | null;
    assigneeId?: string | null;
    completed: boolean;
    rejectionReason?: string | null;
  }): Promise<GovernanceTask | null> {
    return prisma.$transaction(async (tx) => {
      const res = await tx.governanceTask.updateMany({
        where: { id: input.id, status: input.fromStatus },
        data: {
          status: input.toStatus,
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          ...(input.completed ? { completedAt: new Date() } : {}),
          ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
        },
      });
      if (res.count === 0) return null; // état déjà changé (concurrence)
      await tx.governanceTaskEvent.create({
        data: {
          taskId: input.id,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus,
          actorId: input.actorId,
          note: input.note ?? null,
        },
      });
      return tx.governanceTask.findUnique({ where: { id: input.id } });
    });
  }
}
