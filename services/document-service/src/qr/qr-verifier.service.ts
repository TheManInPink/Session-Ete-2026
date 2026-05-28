/**
 * @file        qr-verifier.service.ts
 * @description Vérifie un JWT QR FDI hors-ligne : signature (JWKS cache 24 h),
 *              issuer/audience, cohérence fdi.hash (canonical JSON), révocation.
 *              Latence cible < 50 ms p95 (cf. docs/10 §13.1).
 *
 * @module      document-service/qr
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { importJWK, jwtVerify, type JWTPayload, errors as joseErrors } from 'jose';
import { canonicalJson } from '../fdi/canonical';
import { JwksService } from './jwks.service';
import { RevocationService } from './revocation.service';
import type { QrPayload, QrVerifyResult } from './qr-payload.interface';

const ISSUER = 'urn:nina-aes:ctdec-bamako';
const AUDIENCE = 'urn:nina-aes:verifier';

@Injectable()
export class QrVerifierService {
  private readonly log = new Logger(QrVerifierService.name);

  constructor(
    private readonly jwks: JwksService,
    private readonly revocation: RevocationService,
  ) {}

  /**
   * Vérifie un token JWT QR.
   *
   * Retourne `{ valid: true, fdi, citizen }` ou `{ valid: false, reasonCode }`.
   */
  async verify(token: string): Promise<QrVerifyResult> {
    // 1. Décodage du header (pour récupérer le kid)
    let kid: string;
    try {
      kid = decodeHeader(token).kid;
    } catch {
      return { valid: false, reasonCode: 'INVALID' };
    }

    // 2. Récupération de la clé publique + vérif signature/issuer/audience
    let payload: QrPayload & JWTPayload;
    try {
      const jwk = await this.jwks.getKey(kid);
      const publicKey = await importJWK(jwk, 'RS256');
      const verified = await jwtVerify(token, publicKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['RS256'],
      });
      payload = verified.payload as QrPayload & JWTPayload;
    } catch (err) {
      return { valid: false, reasonCode: mapJoseError(err) };
    }

    // 3. Cohérence fdi.hash → recalcule depuis fdi + citizen
    const recomputed = createHash('sha256')
      .update(
        canonicalJson({
          serialNumber: payload.fdi.serialNumber,
          type: payload.fdi.type,
          language: payload.fdi.language,
          issuedAt: payload.fdi.issuedAt,
          documentId: payload.fdi.documentId,
          citizen: payload.citizen,
        }),
      )
      .digest('hex');
    if (recomputed !== payload.fdi.hash) {
      return { valid: false, reasonCode: 'HASH_MISMATCH' };
    }

    // 4. Révocation
    if (await this.revocation.isRevoked(payload.jti)) {
      return { valid: false, reasonCode: 'REVOKED' };
    }

    return {
      valid: true,
      jti: payload.jti,
      fdi: payload.fdi,
      citizen: payload.citizen,
    };
  }
}

function decodeHeader(token: string): { kid: string; alg: string } {
  const [h] = token.split('.');
  if (!h) throw new Error('token malformé');
  return JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as {
    kid: string;
    alg: string;
  };
}

function mapJoseError(err: unknown): QrVerifyResult extends { reasonCode: infer R } ? R : never {
  if (err instanceof joseErrors.JWTExpired) return 'EXPIRED' as never;
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) return 'BAD_SIGNATURE' as never;
  if (err instanceof joseErrors.JWTClaimValidationFailed) return 'BAD_CLAIM' as never;
  return 'INVALID' as never;
}
