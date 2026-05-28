/**
 * @file        verify-qr.e2e-spec.ts
 * @description Validation Zod du body /verify-qr — exécutée hors HTTP pour
 *              éviter le boot complet (Vault/Redis/MinIO/RabbitMQ indispos
 *              en CI sans services up).
 *
 *              Le test e2e HTTP complet exigerait testcontainers (cf. doc 10
 *              §14.2). En P0, on valide la couche DTO + ZodBodyPipe en isolation.
 */
import { BadRequestException } from '@nestjs/common';
import { ZodBodyPipe } from '../../src/documents/zod-validation.pipe';
import { VerifyQrSchema } from '../../src/documents/dto/verify-qr.dto';

describe('verify-qr DTO pipeline (e2e smoke)', () => {
  const pipe = new ZodBodyPipe(VerifyQrSchema);

  it('rejette un body sans token (400 BadRequest)', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('rejette un token mal formé (3 segments requis)', () => {
    expect(() => pipe.transform({ token: 'pasvalide' })).toThrow(BadRequestException);
  });

  it('rejette un token trop court', () => {
    expect(() => pipe.transform({ token: 'a.b.c' })).toThrow(BadRequestException);
  });

  it('accepte un token JWT bien formé', () => {
    const out = pipe.transform({
      token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.AAA',
    });
    expect(out.token).toBeDefined();
  });

  it("attache un agrégat d'erreurs lisible", () => {
    try {
      pipe.transform({ token: 12 });
      fail('aurait dû lever');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        code: string;
        issues: { path: string; message: string }[];
      };
      expect(response.code).toBe('VALIDATION_FAILED');
      expect(response.issues.length).toBeGreaterThan(0);
    }
  });
});
