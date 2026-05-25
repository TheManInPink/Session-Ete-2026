/**
 * @file        otp.service.spec.ts
 * @description Tests unitaires d'{@link OtpService} — vérifie le contrat
 *              consume-once, le format 6 chiffres et le respect de NX.
 *
 *              ArgonService est stubbé par un hash réversible trivial pour
 *              isoler le comportement Redis/store (le « vrai » Argon2 est
 *              couvert par `argon.service.spec.ts`).
 */

import { OtpService } from './otp.service.js';

const memStore = () => {
  const map = new Map<string, { value: string; expiresAt: number }>();
  return {
    setNxEx: jest.fn(async (key: string, ttl: number, value: string) => {
      if (map.has(key)) return false;
      map.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return true;
    }),
    get: jest.fn(async (key: string) => map.get(key)?.value ?? null),
    del: jest.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) if (map.delete(k)) n += 1;
      return n;
    }),
    ttl: jest.fn(async (key: string) => {
      const v = map.get(key);
      return v ? Math.ceil((v.expiresAt - Date.now()) / 1000) : -2;
    }),
  };
};

const stubArgon = () => ({
  hash: jest.fn(async (s: string) => `H(${s})`),
  verify: jest.fn(async (hash: string, plain: string) => hash === `H(${plain})`),
});

describe('OtpService', () => {
  it('issueRegisterOtp : 1ère émission crée le code (created=true)', async () => {
    const redis = memStore();
    const argon = stubArgon();
    const otp = new OtpService(redis as never, argon as never);

    const res = await otp.issueRegisterOtp('+22370000001');

    expect(res.created).toBe(true);
    expect(res.code).toMatch(/^\d{6}$/);
    expect(res.ttlSeconds).toBeGreaterThan(0);
    expect(redis.setNxEx).toHaveBeenCalledTimes(1);
  });

  it('issueRegisterOtp : 2e émission renvoie created=false (NX)', async () => {
    const redis = memStore();
    const argon = stubArgon();
    const otp = new OtpService(redis as never, argon as never);

    await otp.issueRegisterOtp('+22370000002');
    const second = await otp.issueRegisterOtp('+22370000002');

    expect(second.created).toBe(false);
  });

  it('verifyRegisterOtp : succès consume la clé (anti-replay)', async () => {
    const redis = memStore();
    const argon = stubArgon();
    const otp = new OtpService(redis as never, argon as never);

    const issued = await otp.issueRegisterOtp('+22370000003');

    await expect(otp.verifyRegisterOtp('+22370000003', issued.code)).resolves.toBe(true);
    // 2e tentative avec le même code → clé déjà consommée
    await expect(otp.verifyRegisterOtp('+22370000003', issued.code)).resolves.toBe(false);
  });

  it('verifyRegisterOtp : code erroné retourne false (sans del)', async () => {
    const redis = memStore();
    const argon = stubArgon();
    const otp = new OtpService(redis as never, argon as never);

    await otp.issueRegisterOtp('+22370000004');
    await expect(otp.verifyRegisterOtp('+22370000004', '000000')).resolves.toBe(false);
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('verifyRegisterOtp : pas de clé → false', async () => {
    const redis = memStore();
    const argon = stubArgon();
    const otp = new OtpService(redis as never, argon as never);
    await expect(otp.verifyRegisterOtp('+22370000999', '123456')).resolves.toBe(false);
  });
});
