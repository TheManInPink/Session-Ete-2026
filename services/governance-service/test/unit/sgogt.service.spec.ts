/**
 * @file        sgogt.service.spec.ts
 * @description Tests du cœur SGOGT : émission signée nominale (claims couvrant la
 *              décision + audit), refus du message à soi-même, 404 destinataire
 *              inconnu, ACK anti-IDOR (seul le destinataire acquitte), rejet d'un
 *              ACK sur signature invalide.
 * @module      governance-service/test
 */
jest.mock('@nina-aes/database', () => ({ prisma: {}, Prisma: {} }));
jest.mock('@nina-aes/vault-client', () => ({ VaultClient: class {} }));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SgogtService } from '../../src/sgogt/sgogt.service.js';
import type { SgogtRepository } from '../../src/sgogt/sgogt.repository.js';
import type { JwsSigner } from '../../src/crypto/jws.signer.js';
import type { AuditPublisher } from '../../src/audit/audit.publisher.js';
import type { GovAuthSubject } from '../../src/auth/auth.types.js';

const SENDER = '11111111-1111-1111-1111-111111111111';
const RECIPIENT = '22222222-2222-2222-2222-222222222222';

function makeConfig() {
  const values: Record<string, unknown> = {
    VAULT_SGOGT_KEY_PREFIX: 'sgogt-user-',
    SGOGT_TTL_NORMAL_HOURS: 24,
    SGOGT_TTL_CRITICAL_HOURS: 4,
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService<never, true>;
}

function makeMessageRow(over: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    threadId: '33333333-3333-3333-3333-333333333333',
    senderId: SENDER,
    recipientId: RECIPIENT,
    subject: 'Audit Q2',
    body: 'Traiter en priorité',
    bodyHash: 'h',
    jwsSignature: 'jws.compact.sig',
    signedClaims: {},
    signingKid: `sgogt-user-${SENDER}`,
    priority: 'HIGH',
    status: 'SENT',
    ttlEscalateAt: new Date('2026-06-19T00:00:00.000Z'),
    escalatedToId: null,
    escalatedAt: null,
    readAt: null,
    respondedAt: null,
    readReceiptJws: null,
    previousChainHash: '0'.repeat(64),
    chainHash: 'c'.repeat(64),
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    ...over,
  };
}

function build(repo: Partial<SgogtRepository> = {}, signer: Partial<JwsSigner> = {}) {
  const audit = { publish: jest.fn().mockResolvedValue(true) };
  const signerMock = {
    sign: jest.fn().mockResolvedValue('header.payload.signature'),
    verify: jest.fn().mockResolvedValue(true),
    ...signer,
  } as unknown as JwsSigner;
  const repository = {
    // En test, le `sub` JWT vaut déjà l'`User.id` → la résolution stricte le renvoie tel quel.
    requireInternalUserId: jest.fn().mockImplementation((k: string) => Promise.resolve(k)),
    recipientExists: jest.fn().mockResolvedValue(true),
    lastChainHashForThread: jest.fn().mockResolvedValue(null),
    create: jest
      .fn()
      .mockImplementation((d: Record<string, unknown>) => Promise.resolve(makeMessageRow(d))),
    findById: jest.fn().mockResolvedValue(makeMessageRow()),
    markRead: jest.fn().mockResolvedValue(makeMessageRow({ status: 'READ' })),
    markResponded: jest.fn().mockResolvedValue(makeMessageRow({ status: 'RESPONDED' })),
    ...repo,
  } as unknown as SgogtRepository;
  const service = new SgogtService(
    repository,
    signerMock,
    audit as unknown as AuditPublisher,
    makeConfig(),
  );
  return { service, repository, signer: signerMock, audit };
}

const sender: GovAuthSubject = { userId: SENDER, role: 'official', mfa: true };
const recipientActor: GovAuthSubject = { userId: RECIPIENT, role: 'official', mfa: true };

describe('SgogtService — émission signée', () => {
  it('signe la décision (claims couvrant recipient/priority/threadId/ttl/bodyHash) et audite', async () => {
    const { service, signer, audit } = build();
    const view = await service.send(
      { recipientId: RECIPIENT, subject: 'Audit Q2', body: 'OK fais-le', priority: 'CRITICAL' },
      sender,
      '10.0.0.1',
    );
    expect(view.recipientId).toBe(RECIPIENT);
    // La signature couvre la décision entière.
    expect(signer.sign).toHaveBeenCalledTimes(1);
    const [claims, kid] = (signer.sign as jest.Mock).mock.calls[0];
    expect(kid).toBe(`sgogt-user-${SENDER}`);
    expect(claims).toEqual(
      expect.objectContaining({
        sender: SENDER,
        recipient: RECIPIENT,
        priority: 'CRITICAL',
        subject: 'Audit Q2',
      }),
    );
    expect(claims.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(claims.threadId).toBeDefined();
    expect(claims.ttlEscalateAt).toBeDefined();
    expect(audit.publish).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sgogt.message_sent' }),
    );
  });

  it('REFUSE (401) l’émission si l’émetteur n’est pas provisionné en User.id (pas de fallback keycloakId)', async () => {
    const { service } = build({
      requireInternalUserId: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('SGOGT_USER_NOT_PROVISIONED')),
    });
    await expect(
      service.send({ recipientId: RECIPIENT, subject: 's', body: 'b', priority: 'NORMAL' }, sender),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('REFUSE un message adressé à soi-même', async () => {
    const { service } = build();
    await expect(
      service.send({ recipientId: SENDER, subject: 's', body: 'b', priority: 'NORMAL' }, sender),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404 si le destinataire est introuvable', async () => {
    const { service } = build({ recipientExists: jest.fn().mockResolvedValue(false) });
    await expect(
      service.send({ recipientId: RECIPIENT, subject: 's', body: 'b', priority: 'NORMAL' }, sender),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('TTL CRITICAL plus court que NORMAL (escalade rapide)', async () => {
    const { service, repository } = build();
    await service.send(
      { recipientId: RECIPIENT, subject: 's', body: 'b', priority: 'CRITICAL' },
      sender,
    );
    const critTtl = (repository.create as jest.Mock).mock.calls[0][0].ttlEscalateAt as Date;
    await service.send(
      { recipientId: RECIPIENT, subject: 's', body: 'b', priority: 'NORMAL' },
      sender,
    );
    const normTtl = (repository.create as jest.Mock).mock.calls[1][0].ttlEscalateAt as Date;
    expect(critTtl.getTime()).toBeLessThan(normTtl.getTime());
  });
});

describe('SgogtService — accusé de réception (anti-IDOR)', () => {
  it('AUTORISE le destinataire à accuser réception (ACK signé par le lecteur)', async () => {
    const { service, signer } = build();
    const res = await service.acknowledge('msg-1', recipientActor, '10.0.0.2');
    expect(res.ackJws).toBeDefined();
    expect(res.message.status).toBe('READ');
    // L'ACK est signé avec la clé du LECTEUR.
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ ackType: 'SGOGT_READ_RECEIPT' }),
      `sgogt-user-${RECIPIENT}`,
    );
  });

  it('REFUSE (403) un non-destinataire qui tente d’accuser réception (anti-IDOR)', async () => {
    const { service } = build();
    await expect(service.acknowledge('msg-1', sender)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('REJETTE l’ACK si la signature de l’émetteur est invalide (message forgé)', async () => {
    const { service } = build({}, { verify: jest.fn().mockResolvedValue(false) });
    await expect(service.acknowledge('msg-1', recipientActor)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('SgogtService — vérification', () => {
  it('vérifie signature + cohérence claims↔colonnes + bodyHash↔body', async () => {
    const sha256Hex = (s: string) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:crypto').createHash('sha256').update(s, 'utf8').digest('hex');
    const claims = {
      sender: SENDER,
      recipient: RECIPIENT,
      priority: 'HIGH',
      threadId: '33333333-3333-3333-3333-333333333333',
      ttlEscalateAt: new Date('2026-06-19T00:00:00.000Z').toISOString(),
      bodyHash: sha256Hex('Traiter en priorité'),
    };
    const { service } = build({
      findById: jest.fn().mockResolvedValue(makeMessageRow({ signedClaims: claims })),
    });
    await expect(service.verify('msg-1')).resolves.toBe(true);
  });

  it('détecte une altération en base (priority changée sans re-signature)', async () => {
    const claims = {
      sender: SENDER,
      recipient: RECIPIENT,
      priority: 'NORMAL', // claim signé dit NORMAL…
      threadId: '33333333-3333-3333-3333-333333333333',
      ttlEscalateAt: new Date('2026-06-19T00:00:00.000Z').toISOString(),
      bodyHash: 'whatever',
    };
    const { service } = build({
      // …mais la colonne dit HIGH → incohérence détectée.
      findById: jest
        .fn()
        .mockResolvedValue(makeMessageRow({ signedClaims: claims, priority: 'HIGH' })),
    });
    await expect(service.verify('msg-1')).resolves.toBe(false);
  });
});
