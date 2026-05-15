/**
 * @file        sanitize.test.ts
 * @description Tests Jest pour sanitizeForLog.
 * @module      @nina-aes/utils
 */

import { sanitizeForLog } from '../sanitize';

describe('sanitizeForLog', () => {
  it('rédige les clés sensibles', () => {
    const out = sanitizeForLog({
      password: 'hunter2',
      token: 'abc',
      authorization: 'Bearer xyz',
      jwt: 'eyJ...',
      api_key: 'sk-...',
      photo: 'base64...',
    }) as Record<string, string>;

    expect(out.password).toBe('[REDACTED]');
    expect(out.token).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.jwt).toBe('[REDACTED]');
    expect(out.api_key).toBe('[REDACTED]');
    expect(out.photo).toBe('[REDACTED]');
  });

  it('masque les NINA via maskNina', () => {
    const out = sanitizeForLog({ nina: '18903102015042Z' }) as Record<string, string>;
    expect(out.nina).toMatch(/^18\*+2Z$/);
  });

  it('masque les e-mails', () => {
    const out = sanitizeForLog({ email: 'jean.dupont@example.com' }) as Record<string, string>;
    expect(out.email).toMatch(/^j\*+@example\.com$/);
  });

  it('masque les téléphones (4 derniers chiffres conservés)', () => {
    const out = sanitizeForLog({ phone: '+22376547842' }) as Record<string, string>;
    const phone = out.phone!;
    expect(phone.endsWith('7842')).toBe(true);
    expect(phone).toMatch(/\*/);
  });

  it('agit récursivement sur les objets imbriqués et les tableaux', () => {
    const out = sanitizeForLog({
      user: { email: 'a@b.com', password: 'x' },
      tokens: [{ token: 'abc' }, { token: 'def' }],
    }) as { user: { email: string; password: string }; tokens: Array<{ token: string }> };

    expect(out.user.password).toBe('[REDACTED]');
    expect(out.user.email).toMatch(/^a\*+@b\.com$/);
    expect(out.tokens[0]!.token).toBe('[REDACTED]');
    expect(out.tokens[1]!.token).toBe('[REDACTED]');
  });

  it('laisse les valeurs primitives et null intactes', () => {
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog('hello')).toBe('hello');
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
  });

  it('sérialise les Date en ISO', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(sanitizeForLog(d)).toBe('2026-01-01T00:00:00.000Z');
  });
});
