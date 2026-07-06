/**
 * @file        directives.service.spec.ts
 * @description Tests des directives Kanban : transition invalide rejetée (400),
 *              transition valide auditée, conflit concurrent (409), RBAC de
 *              transition (un tiers non habilité = 403).
 * @module      governance-service/test
 */
jest.mock('@nina-aes/database', () => ({ prisma: {}, Prisma: {} }));

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DirectivesService } from '../../src/directives/directives.service.js';
import type { DirectivesRepository } from '../../src/directives/directives.repository.js';
import type { AuditPublisher } from '../../src/audit/audit.publisher.js';
import type { GovAuthSubject } from '../../src/auth/auth.types.js';

const CREATOR = '11111111-1111-1111-1111-111111111111';
const ASSIGNEE = '22222222-2222-2222-2222-222222222222';
const STRANGER = '99999999-9999-9999-9999-999999999999';

function task(over: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Vérifier centre X',
    description: 'desc',
    status: 'SENT',
    priority: 'HIGH',
    createdById: CREATOR,
    assigneeId: ASSIGNEE,
    deadline: null,
    escalationLevel: 0,
    rejectionReason: null,
    completedAt: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    updatedAt: new Date('2026-06-18T00:00:00.000Z'),
    ...over,
  };
}

function build(repo: Partial<DirectivesRepository> = {}) {
  const audit = { publish: jest.fn().mockResolvedValue(true) };
  const repository = {
    // En test, le `sub` JWT vaut déjà l'`User.id` → la résolution stricte le renvoie tel quel.
    requireInternalUserId: jest.fn().mockImplementation((k: string) => Promise.resolve(k)),
    userExists: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue(task()),
    transition: jest
      .fn()
      .mockImplementation((i: { toStatus: string }) =>
        Promise.resolve(task({ status: i.toStatus })),
      ),
    ...repo,
  } as unknown as DirectivesRepository;
  const service = new DirectivesService(repository, audit as unknown as AuditPublisher);
  return { service, repository, audit };
}

const assigneeActor: GovAuthSubject = { userId: ASSIGNEE, role: 'official', mfa: true };
const supervisor: GovAuthSubject = { userId: 'sup', role: 'supervisor', mfa: true };
const stranger: GovAuthSubject = { userId: STRANGER, role: 'official', mfa: true };

describe('DirectivesService — transitions', () => {
  it('AUTORISE une transition légale (SENT→IN_PROGRESS) et l’audite', async () => {
    const { service, audit } = build();
    const view = await service.transition('task-1', { toStatus: 'IN_PROGRESS' }, assigneeActor);
    expect(view.status).toBe('IN_PROGRESS');
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'governance.task_transitioned' }),
    );
  });

  it('REJETTE une transition INVALIDE (SENT→COMPLETED saute IN_PROGRESS) → 400', async () => {
    const { service, audit } = build();
    await expect(
      service.transition('task-1', { toStatus: 'COMPLETED' }, assigneeActor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.publish).not.toHaveBeenCalled();
  });

  it('exige une note pour un rejet est porté par le DTO ; le service rejette en 400 une transition illégale depuis un état terminal', async () => {
    const { service } = build({
      findById: jest.fn().mockResolvedValue(task({ status: 'COMPLETED' })),
    });
    await expect(
      service.transition('task-1', { toStatus: 'IN_PROGRESS' }, supervisor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('renvoie 409 si l’état a déjà changé sous concurrence (transition renvoie null)', async () => {
    const { service } = build({ transition: jest.fn().mockResolvedValue(null) });
    await expect(
      service.transition('task-1', { toStatus: 'IN_PROGRESS' }, supervisor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('REFUSE (403) un tiers non habilité (ni créateur, ni assignee, ni privilégié)', async () => {
    const { service } = build();
    await expect(
      service.transition('task-1', { toStatus: 'IN_PROGRESS' }, stranger),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('AUTORISE un superviseur à transiter même s’il n’est ni créateur ni assignee', async () => {
    const { service } = build();
    await expect(
      service.transition('task-1', { toStatus: 'IN_PROGRESS' }, supervisor),
    ).resolves.toBeDefined();
  });
});
