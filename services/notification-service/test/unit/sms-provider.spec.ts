/**
 * @file        sms-provider.spec.ts
 * @description Tests du fournisseur Africa's Talking (fetch mocké) : succès,
 *              échec fournisseur, erreur réseau, coupe-circuit, mapping DLR.
 * @module      notification-service/test
 */
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env.schema.js';
import {
  NotificationStatus,
  type Lang,
  type RenderedMessage,
} from '../../src/notifications/channels/channel.types.js';
import { AfricasTalkingSmsProvider } from '../../src/notifications/channels/sms.provider.js';

/** Construit un ConfigService factice à partir d'overrides. */
function cfg(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const base: Record<string, unknown> = {
    AT_API_KEY: 'sandbox-api-key',
    AT_USERNAME: 'sandbox',
    AT_SMS_SENDER_ID: 'NINA-AES',
    AT_SMS_ENABLED: true,
    AT_BASE_URL: undefined,
    ...overrides,
  };
  return { get: (k: string) => base[k] } as unknown as ConfigService<Env, true>;
}

const MSG: RenderedMessage = { recipient: '+22376000000', body: 'Test', language: 'FR' as Lang };

describe('AfricasTalkingSmsProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('renvoie SENT + providerId quand AT accepte', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        SMSMessageData: { Recipients: [{ status: 'Success', messageId: 'ATXid_123' }] },
      }),
    }) as unknown as typeof fetch;

    const provider = new AfricasTalkingSmsProvider(cfg());
    const res = await provider.send(MSG);
    expect(res.status).toBe(NotificationStatus.SENT);
    expect(res.providerId).toBe('ATXid_123');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('renvoie FAILED quand le destinataire est rejeté', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        SMSMessageData: { Recipients: [{ status: 'UserInBlacklist', statusCode: 406 }] },
      }),
    }) as unknown as typeof fetch;

    const provider = new AfricasTalkingSmsProvider(cfg());
    const res = await provider.send(MSG);
    expect(res.status).toBe(NotificationStatus.FAILED);
    expect(res.failureReason).toContain('UserInBlacklist');
  });

  it('renvoie FAILED en cas d’erreur réseau (ne lève pas)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const provider = new AfricasTalkingSmsProvider(cfg());
    const res = await provider.send(MSG);
    expect(res.status).toBe(NotificationStatus.FAILED);
    expect(res.failureReason).toContain('ECONNREFUSED');
  });

  it('ne contacte pas le réseau quand AT_SMS_ENABLED=false', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const provider = new AfricasTalkingSmsProvider(cfg({ AT_SMS_ENABLED: false }));
    const res = await provider.send(MSG);
    expect(res.status).toBe(NotificationStatus.SENT);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('mappe correctement les statuts DLR', () => {
    expect(AfricasTalkingSmsProvider.mapDlrStatus('Success')).toBe(NotificationStatus.DELIVERED);
    expect(AfricasTalkingSmsProvider.mapDlrStatus('Sent')).toBe(NotificationStatus.SENT);
    expect(AfricasTalkingSmsProvider.mapDlrStatus('Failed')).toBe(NotificationStatus.FAILED);
    expect(AfricasTalkingSmsProvider.mapDlrStatus('Inconnu')).toBeNull();
  });
});
