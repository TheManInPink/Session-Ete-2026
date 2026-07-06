/**
 * @file        directives.service.ts
 * @description Cœur métier des directives Kanban (Bloc C2). Cycle de vie strict
 *              (DRAFT→SENT→IN_PROGRESS→COMPLETED/REJECTED) avec transitions
 *              VALIDÉES par la machine à états + historique audité. Une
 *              transition illégale est rejetée (400) ; une transition concurrente
 *              déjà appliquée est rejetée (409).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/directives
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { GovernanceTask } from '@nina-aes/database';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import type { GovAuthSubject } from '../auth/auth.types.js';
import type { CreateDirectiveDto, TransitionDirectiveDto } from './dto/directive.schema.js';
import { isTransitionAllowed, type TaskStatus } from './directive.state-machine.js';
import { DirectivesRepository } from './directives.repository.js';

/** Vue publique d'une directive. */
export interface DirectiveView {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdById: string;
  assigneeId: string | null;
  deadline: string | null;
  escalationLevel: number;
  rejectionReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DirectivesService {
  constructor(
    private readonly repo: DirectivesRepository,
    private readonly audit: AuditPublisher,
  ) {}

  /** Crée une directive (statut initial DRAFT). */
  async create(
    dto: CreateDirectiveDto,
    actor: GovAuthSubject,
    ip?: string | null,
  ): Promise<DirectiveView> {
    const createdById = await this.repo.requireInternalUserId(actor.userId);

    if (dto.assigneeId && !(await this.repo.userExists(dto.assigneeId))) {
      throw new NotFoundException('Assignee introuvable');
    }

    const task = await this.repo.create({
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      createdById,
      assigneeId: dto.assigneeId ?? null,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
    });

    await this.audit.publish({
      action: AuditAction.GOVERNANCE_TASK_TRANSITIONED,
      entityType: 'GovernanceTask',
      entityId: task.id,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { event: 'created', status: 'DRAFT', priority: dto.priority },
    });
    return this.toView(task);
  }

  /** Liste paginée par statut (colonne Kanban). */
  async list(status: string | undefined, page: number, pageSize: number): Promise<DirectiveView[]> {
    const p = Math.max(1, page);
    const ps = Math.min(200, Math.max(1, pageSize));
    const recs = await this.repo.listByStatus(status as TaskStatus | undefined, (p - 1) * ps, ps);
    return recs.map((r) => this.toView(r));
  }

  /**
   * Applique une transition de cycle de vie. Vérifie d'abord qu'elle est LÉGALE
   * (machine à états), puis l'exécute atomiquement (rejet 409 si l'état a déjà
   * changé sous concurrence). Chaque transition est auditée.
   */
  async transition(
    id: string,
    dto: TransitionDirectiveDto,
    actor: GovAuthSubject,
    ip?: string | null,
  ): Promise<DirectiveView> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Directive introuvable');

    const from = existing.status as TaskStatus;
    const to = dto.toStatus;

    // Transition Kanban INVALIDE → 400 (rejet de transition illégale).
    if (!isTransitionAllowed(from, to)) {
      throw new BadRequestException(`Transition Kanban invalide : ${from} → ${to}`);
    }

    if (dto.assigneeId && !(await this.repo.userExists(dto.assigneeId))) {
      throw new NotFoundException('Assignee introuvable');
    }

    // Seul le créateur, l'assignee, un superviseur/admin peut faire avancer.
    const actorUserId = await this.repo.requireInternalUserId(actor.userId);
    const privileged = ['supervisor', 'admin', 'director'].includes(actor.role.toLowerCase());
    if (
      !privileged &&
      actorUserId !== existing.createdById &&
      actorUserId !== existing.assigneeId
    ) {
      throw new ForbiddenException('DIRECTIVE_TRANSITION_FORBIDDEN');
    }

    const updated = await this.repo.transition({
      id,
      fromStatus: from,
      toStatus: to,
      actorId: actorUserId,
      note: dto.note ?? null,
      assigneeId: dto.assigneeId,
      completed: to === 'COMPLETED',
      rejectionReason: to === 'REJECTED' ? (dto.note ?? null) : null,
    });
    if (!updated) {
      // L'état a changé entre la lecture et l'update (course) → conflit.
      throw new ConflictException('Directive déjà modifiée (transition concurrente)');
    }

    await this.audit.publish({
      action: AuditAction.GOVERNANCE_TASK_TRANSITIONED,
      entityType: 'GovernanceTask',
      entityId: id,
      actorId: actor.userId,
      actorType: actor.role,
      ipAddress: ip,
      metadata: { from, to },
    });
    return this.toView(updated);
  }

  /** Projette une ligne en vue publique. */
  private toView(t: GovernanceTask): DirectiveView {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      createdById: t.createdById,
      assigneeId: t.assigneeId,
      deadline: t.deadline ? t.deadline.toISOString() : null,
      escalationLevel: t.escalationLevel,
      rejectionReason: t.rejectionReason,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
