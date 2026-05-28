import { GenerateFdiSchema } from '../../src/documents/dto/generate-fdi.dto';
import { VerifyQrSchema } from '../../src/documents/dto/verify-qr.dto';
import { RevokeSchema } from '../../src/documents/dto/revoke.dto';

describe('Document DTOs (Zod)', () => {
  describe('GenerateFdiSchema', () => {
    it('accepte un NINA valide + language par défaut', () => {
      const out = GenerateFdiSchema.parse({ nina: '19850315123456A' });
      expect(out.language).toBe('fra');
    });

    it('refuse NINA mal formé', () => {
      expect(() => GenerateFdiSchema.parse({ nina: '123' })).toThrow();
    });

    it('refuse language hors enum', () => {
      expect(() => GenerateFdiSchema.parse({ nina: '19850315123456A', language: 'en' })).toThrow();
    });

    it('refuse les propriétés inconnues (strict)', () => {
      expect(() => GenerateFdiSchema.parse({ nina: '19850315123456A', extra: 'x' })).toThrow();
    });
  });

  describe('VerifyQrSchema', () => {
    it('accepte un JWT bien formé', () => {
      const ok = VerifyQrSchema.parse({
        token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.AAA',
      });
      expect(ok.token).toContain('.');
    });

    it('refuse un token sans 3 segments', () => {
      expect(() => VerifyQrSchema.parse({ token: 'aa.bb' })).toThrow();
    });
  });

  describe('RevokeSchema', () => {
    it('accepte un motif valide', () => {
      const out = RevokeSchema.parse({ reason: 'DECEASED' });
      expect(out.reason).toBe('DECEASED');
    });

    it('refuse un motif hors enum', () => {
      expect(() => RevokeSchema.parse({ reason: 'WHIM' })).toThrow();
    });
  });
});
