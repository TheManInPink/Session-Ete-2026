/**
 * @file        redaction.test.ts
 * @description Tests unitaires du masquage PII.
 *
 *              ENJEU : ces tests sont le garde-fou critique contre la fuite
 *              accidentelle de NINA, téléphones ou e-mails dans Loki/Grafana.
 *              Tout PR qui modifie `redaction.ts` doit faire passer ces tests.
 */

import { maskEmail, maskNina, maskPhone, PII_REDACT_PATHS } from '../redaction.js';

describe('maskNina', () => {
  it('masque les 13 caractères centraux en gardant sexe et lettre de contrôle', () => {
    // NINA fictif : 1 (homme) + 72 (1972) + 12 (déc.) + ... + A (contrôle)
    expect(maskNina('1721234567890A')).toBe('1*************A');
  });

  it('renvoie [invalid-nina] si la longueur est incorrecte', () => {
    expect(maskNina('123')).toBe('[invalid-nina]');
    expect(maskNina('1234567890123456')).toBe('[invalid-nina]');
  });

  it("renvoie [invalid-nina] si l'entrée n'est pas une string", () => {
    expect(maskNina(undefined)).toBe('[invalid-nina]');
    expect(maskNina(null)).toBe('[invalid-nina]');
    expect(maskNina(123)).toBe('[invalid-nina]');
  });
});

describe('maskPhone', () => {
  it('masque les chiffres après le préfixe pays', () => {
    expect(maskPhone('+22366123456')).toBe('+22366******');
  });

  it('gère les préfixes 00xxx', () => {
    expect(maskPhone('0022366123456')).toBe('0022366******');
  });

  it('renvoie [invalid-phone] sur formats inattendus', () => {
    expect(maskPhone('abc')).toBe('[invalid-phone]');
    expect(maskPhone('')).toBe('[invalid-phone]');
    expect(maskPhone(undefined)).toBe('[invalid-phone]');
  });
});

describe('maskEmail', () => {
  it('masque le local part en gardant la première lettre', () => {
    expect(maskEmail('mamadou@example.ml')).toBe('m******@example.ml');
  });

  it('renvoie [invalid-email] sans @', () => {
    expect(maskEmail('pasvalide')).toBe('[invalid-email]');
    expect(maskEmail(undefined)).toBe('[invalid-email]');
  });
});

describe('PII_REDACT_PATHS', () => {
  it('contient les chemins critiques NINA-AES', () => {
    const required = [
      'password',
      'token',
      'authorization',
      'nina',
      'fingerprintHash',
      'biometricHash',
      'vaultToken',
      'mfaSecret',
      'privateKey',
    ];
    for (const path of required) {
      expect(PII_REDACT_PATHS).toContain(path);
    }
  });

  it('ne contient pas de doublons', () => {
    const set = new Set(PII_REDACT_PATHS);
    expect(set.size).toBe(PII_REDACT_PATHS.length);
  });
});
