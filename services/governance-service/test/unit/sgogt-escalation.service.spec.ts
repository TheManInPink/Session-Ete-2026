/**
 * @file        sgogt-escalation.service.spec.ts
 * @description Tests de l'escalade automatique : déclenchée après TTL vers le
 *              supérieur (événement signé + chaîné + audit), ignorée s'il n'y a
 *              pas de supérieur, idempotente sous concurrence (applyEscalation
 *              renvoie false).
 * @module      governance-service/test
 */
jest.mock('@nina-aes/database', () => ({ prisma: {}, Prisma: {} }));
jest.mock('@nina-aes/vault-client', () => ({ VaultClient: class {} }));

import { ConfigService } from '@nestjs/config';
import { SgogtEscalationService } from '../../src/sgogt/sgogt-escalation.service.js';
import type { SgogtRepository } from '../../src/sgogt/sgogt.repository.js';
import type { JwsSigner } from '../../src/crypto/jws.signer.js';
import type { AuditPublisher } from '../../src/audit/audit.publisher.js';

const RECIPIENT = '22222222-2222-2222-2222-222222222222';
const MANAGER = '44444444-4444-4444-4444-444444444444';

function dueMessage(over: Record<string, unknown> = {}) {
  return {
    id: 'msg-due',
    threadId: 't-1',
    recipientId: RECIPIENT,
    status: 'SENT',
    ttlEscalateAt: new Date('2026-06-18T00:00:00.000Z'),
    escalatedToId: null,
    ...over,
  };
}

function build(repo: Partial<SgogtRepository> = {}) {
  const audit = { publish: jest.fn().mockResolvedValue(true) };
  const signer = { sign: jest.fn().mockResolvedValue('esc.jws.sig') } as unknown as JwsSigner;
  const repository = {
    dueForEscalation: jest.fn().mockResolvedValue([dueMessage()]),
    resolveManager: jest.fn().mockResolvedValue(MANAGER),
    lastEscalationHash: jest.fn().mockResolvedValue(null),
    applyEscalation: jest.fn().mockResolvedValue(true),
    ...repo,
  } as unknown as SgogtRepository;
  const cfg = {
    get: () => 'elections-export',
  } as unknown as ConfigService<never, true>;
  const service = new SgogtEscalationService(
    repository,
    signer,
    audit as unknown as AuditPublisher,
    cfg,
  );
  return { service, repository, signer, audit };
}

describe('SgogtEscalationService — balayage', () => {
  it('ESCALADE un message échu vers le supérieur (signé + audité)', async () => {
    const { service, repository, signer, audit } = build();
    const n = await service.sweep(new Date('2026-06-19T00:00:00.000Z'));
    expect(n).toBe(1);
    expect(signer.sign).toHaveBeenCalledTimes(1); // événement d'escalade signé
    expect(repository.applyEscalation).toHaveBeenCalledWith(
      expect.objectContaining({ fromUserId: RECIPIENT, toUserId: MANAGER, level: 1 }),
    );
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sgogt.message_escalated' }),
    );
  });

  it('N’ESCALADE PAS si le destinataire n’a pas de supérieur (sommet hiérarchique)', async () => {
    const { service, repository, audit } = build({
      resolveManager: jest.fn().mockResolvedValue(null),
    });
    const n = await service.sweep();
    expect(n).toBe(0);
    expect(repository.applyEscalation).not.toHaveBeenCalled();
    expect(audit.publish).not.toHaveBeenCalled();
  });

  it('est IDEMPOTENT : si applyEscalation renvoie false (déjà escaladé), pas de double audit', async () => {
    const { service, audit } = build({
      applyEscalation: jest.fn().mockResolvedValue(false),
    });
    const n = await service.sweep();
    expect(n).toBe(0);
    expect(audit.publish).not.toHaveBeenCalled();
  });
});
