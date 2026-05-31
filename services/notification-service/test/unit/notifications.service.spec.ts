/**
 * @file        notifications.service.spec.ts
 * @description Tests du cœur métier (mocks : repo en mémoire, dispatcher,
 *              publisher ; registry + métriques réels). Couvre : envoi nominal,
 *              déduction de canal, idempotence, échec, broadcast.
 * @module      notification-service/test
 */
import { Prisma, type Notification } from '@nina-aes/database';
import {
  NotificationChannel,
  NotificationStatus,
  type ChannelSendResult,
  type RenderedMessage,
} from '../../src/notifications/channels/channel.types.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { NotificationsMetrics } from '../../src/notifications/metrics/notifications.metrics.js';
import { TemplateRegistry } from '../../src/notifications/templates/template.registry.js';
import type { NotificationRepository } from '../../src/notifications/notification.repository.js';
import type { ChannelDispatcher } from '../../src/notifications/channels/channel.dispatcher.js';
import type { NotificationPublisher } from '../../src/notifications/consumer/notification.publisher.js';

// `@nina-aes/database` est un package ESM (type: module) : on le mocke pour le
// runtime CommonJS de Jest. Le service n'appelle jamais Prisma directement
// (repo factice en mémoire) ; seul `Prisma.PrismaClientKnownRequestError` est
// référencé par le garde d'idempotence.
jest.mock('@nina-aes/database', () => ({
  prisma: {},
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code = '';
    },
  },
}));

/** Compteur d'UUID déterministe pour les tests. */
let seq = 0;

/** Repo en mémoire (idempotence réaliste via dedupeKey). */
class FakeRepo {
  byId = new Map<string, Notification>();
  byDedupe = new Map<string, Notification>();

  create(input: Record<string, unknown>): Promise<Notification> {
    const dedupeKey = (input.dedupeKey as string) ?? null;
    // Reproduit la contrainte UNIQUE Postgres (P2002) sur dedupe_key.
    if (dedupeKey && this.byDedupe.has(dedupeKey)) {
      const e = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      });
      (e as { code: string }).code = 'P2002';
      return Promise.reject(e);
    }
    const id = `notif-${++seq}`;
    const now = new Date();
    const n = {
      id,
      recipientUserId: (input.recipientUserId as string) ?? null,
      recipientCitizenId: (input.recipientCitizenId as string) ?? null,
      channel: input.channel as string,
      status: (input.status as string) ?? 'PENDING',
      templateKey: input.templateKey as string,
      language: input.language as string,
      payload: input.payload,
      dedupeKey: (input.dedupeKey as string) ?? null,
      providerId: null,
      sentAt: null,
      deliveredAt: null,
      failureReason: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    } as unknown as Notification;
    this.byId.set(id, n);
    if (n.dedupeKey) this.byDedupe.set(n.dedupeKey, n);
    return Promise.resolve(n);
  }
  findById(id: string): Promise<Notification | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  findByDedupeKey(key: string): Promise<Notification | null> {
    return Promise.resolve(this.byDedupe.get(key) ?? null);
  }
  findByProviderId(): Promise<Notification | null> {
    return Promise.resolve(null);
  }
  updateStatus(id: string, patch: Record<string, unknown>): Promise<Notification> {
    const n = { ...(this.byId.get(id) as Notification), ...patch, updatedAt: new Date() };
    this.byId.set(id, n);
    if (n.dedupeKey) this.byDedupe.set(n.dedupeKey, n);
    return Promise.resolve(n);
  }
  claimForRetry(id: string): Promise<boolean> {
    const n = this.byId.get(id);
    if (n && n.status === 'FAILED') {
      const updated = { ...n, status: 'PENDING' } as unknown as Notification;
      this.byId.set(id, updated);
      if (updated.dedupeKey) this.byDedupe.set(updated.dedupeKey, updated);
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }
}

/** Dispatcher mocké : capture les appels, renvoie un résultat configurable. */
class FakeDispatcher {
  calls: Array<{ channel: NotificationChannel; message: RenderedMessage }> = [];
  result: ChannelSendResult = { status: NotificationStatus.SENT, providerId: 'prov-1' };
  dispatch(channel: NotificationChannel, message: RenderedMessage): Promise<ChannelSendResult> {
    this.calls.push({ channel, message });
    return Promise.resolve(this.result);
  }
}

function makeService(): {
  service: NotificationsService;
  repo: FakeRepo;
  dispatcher: FakeDispatcher;
  publisher: { isReady: jest.Mock; publishJob: jest.Mock; maxRetries: number };
} {
  const repo = new FakeRepo();
  const dispatcher = new FakeDispatcher();
  const publisher = {
    isReady: jest.fn().mockReturnValue(true),
    publishJob: jest.fn(),
    maxRetries: 5,
  };
  const cfg = { get: (k: string) => (k === 'DEFAULT_LANGUAGE' ? 'FR' : undefined) };
  const service = new NotificationsService(
    cfg as never,
    new TemplateRegistry(),
    dispatcher as unknown as ChannelDispatcher,
    repo as unknown as NotificationRepository,
    new NotificationsMetrics(),
    publisher as unknown as NotificationPublisher,
  );
  return { service, repo, dispatcher, publisher };
}

describe('NotificationsService', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('envoie un SMS (canal déduit du numéro) et persiste SENT', async () => {
    const { service, dispatcher, repo } = makeService();
    const res = await service.sendOne({
      recipient: '+22376000000',
      template: 'mfa-code',
      variables: { code: '482913', ttl: 5 },
    });

    expect(dispatcher.calls).toHaveLength(1);
    expect(dispatcher.calls[0]!.channel).toBe(NotificationChannel.SMS);
    expect(dispatcher.calls[0]!.message.body).toContain('482913');
    expect(res.notification.status).toBe(NotificationStatus.SENT);
    expect(res.notification.providerId).toBe('prov-1');
    expect(res.deduped).toBe(false);
    expect(repo.byId.size).toBe(1);
  });

  it('déduit le canal EMAIL pour une adresse email', async () => {
    const { service, dispatcher } = makeService();
    await service.sendOne({
      recipient: 'awa@example.ml',
      template: 'correction-submitted',
      variables: { id: '42' },
    });
    expect(dispatcher.calls[0]!.channel).toBe(NotificationChannel.EMAIL);
    expect(dispatcher.calls[0]!.message.subject).toContain('42');
  });

  it('est idempotent : un second envoi identique ne ré-expédie pas', async () => {
    const { service, dispatcher } = makeService();
    const job = {
      recipient: '+22370000001',
      template: 'mfa-code',
      variables: { code: '1', ttl: 5 },
    };

    const first = await service.sendOne(job);
    const second = await service.sendOne(job);

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(dispatcher.calls).toHaveLength(1); // une seule expédition réelle
    expect(second.notification.id).toBe(first.notification.id);
  });

  it('persiste FAILED quand le fournisseur échoue', async () => {
    const { service, dispatcher } = makeService();
    dispatcher.result = { status: NotificationStatus.FAILED, failureReason: 'réseau AT' };
    const res = await service.processJob(
      { recipient: '+22376000002', template: 'mfa-code', variables: { code: '9', ttl: 5 } },
      2,
    );
    expect(res.notification.status).toBe(NotificationStatus.FAILED);
    expect(res.notification.failureReason).toBe('réseau AT');
    expect(res.notification.retryCount).toBe(2);
  });

  it('force le canal explicite même si le format suggère autre chose', async () => {
    const { service, dispatcher } = makeService();
    // recipient « ressemble » à un email mais channel=sms est imposé
    await service.sendOne({
      recipient: 'token@device',
      channel: 'sms',
      template: 'ussd-confirmation',
      variables: { ref: 'OP-1' },
    });
    expect(dispatcher.calls[0]!.channel).toBe(NotificationChannel.SMS);
  });

  it('ne ré-expédie pas le perdant d’une course de création (P2002)', async () => {
    const dispatcher = new FakeDispatcher();
    const publisher = {
      isReady: jest.fn().mockReturnValue(true),
      publishJob: jest.fn(),
      maxRetries: 5,
    };
    const cfg = { get: (k: string) => (k === 'DEFAULT_LANGUAGE' ? 'FR' : undefined) };
    const pendingRow = {
      id: 'race-1',
      status: 'PENDING',
      channel: 'SMS',
      providerId: null,
      dedupeKey: 'k',
    } as unknown as Notification;

    const repo = {
      // create-first : le INSERT lève P2002, puis findByDedupeKey renvoie la
      // ligne gagnante (PENDING) → court-circuit sans ré-expédition.
      findByDedupeKey: jest.fn().mockResolvedValue(pendingRow),
      create: jest.fn().mockImplementation(() => {
        // 2e arg requis par la signature réelle ; le mock runtime réinitialise
        // `code` via son initialiseur de champ → on le force ensuite.
        const e = new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        });
        (e as { code: string }).code = 'P2002';
        return Promise.reject(e);
      }),
      updateStatus: jest.fn(),
      findById: jest.fn(),
      findByProviderId: jest.fn(),
    };

    const service = new NotificationsService(
      cfg as never,
      new TemplateRegistry(),
      dispatcher as unknown as ChannelDispatcher,
      repo as unknown as NotificationRepository,
      new NotificationsMetrics(),
      publisher as unknown as NotificationPublisher,
    );

    const res = await service.sendOne({
      recipient: '+22376000099',
      template: 'mfa-code',
      variables: { code: '1', ttl: 5 },
    });

    expect(res.deduped).toBe(true);
    expect(dispatcher.calls).toHaveLength(0); // le perdant n'expédie pas
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('ré-essaie une notification précédemment FAILED (claim FAILED→PENDING)', async () => {
    const { service, dispatcher } = makeService();
    const job = {
      recipient: '+22376000050',
      template: 'mfa-code',
      variables: { code: '7', ttl: 5 },
    };

    dispatcher.result = { status: NotificationStatus.FAILED, failureReason: 'boom' };
    const first = await service.processJob(job, 0);
    expect(first.notification.status).toBe(NotificationStatus.FAILED);

    // Même job (ré-essai) : la ligne FAILED est reprise et ré-expédiée.
    dispatcher.result = { status: NotificationStatus.SENT, providerId: 'ok-1' };
    const retry = await service.processJob(job, 1);
    expect(retry.deduped).toBe(false);
    expect(retry.notification.status).toBe(NotificationStatus.SENT);
    expect(dispatcher.calls).toHaveLength(2); // ré-expédié une 2e fois
  });

  it('broadcast publie un job par destinataire', async () => {
    const { service, publisher } = makeService();
    const out = await service.broadcast({
      template: 'appointment-reminder-24h',
      variables: { date: '2026-06-02', location: 'CTDEC Bamako' },
      recipients: [{ recipient: '+22370000010' }, { recipient: '+22370000011' }],
    });
    expect(out.accepted).toBe(2);
    expect(out.skipped).toBe(0);
    expect(publisher.publishJob).toHaveBeenCalledTimes(2);
    expect(out.byChannel.SMS).toBe(2);
  });
});
