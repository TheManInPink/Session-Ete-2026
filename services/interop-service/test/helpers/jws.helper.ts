/**
 * @file        jws.helper.ts
 * @description Aides de test : génération de paires Ed25519 et de JWS BCID-AES
 *              valides/forgés pour piloter les tests négatifs de sécurité (§5bis).
 * @module      interop-service/test/helpers
 */
import { SignJWT, exportJWK, generateKeyPair, type JWK, type CryptoKey } from 'jose';

/** Paire Ed25519 générée pour un partenaire de test. */
export interface TestKeyPair {
  privateKey: CryptoKey;
  publicJwk: JWK;
}

/** Génère une paire Ed25519 (clé publique exportée en JWK). */
export async function makeEd25519KeyPair(): Promise<TestKeyPair> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.crv = 'Ed25519';
  publicJwk.kty = 'OKP';
  return { privateKey, publicJwk };
}

/** Payload métier verify-nina de base, valide. */
export function baseRequest(requestId: string): Record<string, unknown> {
  return {
    nina: '18903102015042V',
    requesterCountry: 'BFA',
    purpose: 'border-control',
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/** Signe un JWS verify-nina complet (claims protégés jti/iat/nbf/exp/iss/aud). */
export async function signRequestJws(
  key: CryptoKey,
  payload: Record<string, unknown>,
  opts?: { iss?: string; aud?: string; nbf?: string; exp?: string; jti?: string; kid?: string },
): Promise<string> {
  const jti = opts?.jti ?? (payload.requestId as string);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: opts?.kid ?? 'bfa-2026-q2' })
    .setJti(jti)
    .setIssuedAt()
    .setNotBefore(opts?.nbf ?? '0s')
    .setIssuer(opts?.iss ?? 'https://interop.dgec.bf')
    .setAudience(opts?.aud ?? 'aes:MLI')
    .setExpirationTime(opts?.exp ?? '5m')
    .sign(key);
}

/**
 * Forge un JWS avec `alg:none` (header `{"alg":"none"}` + payload + signature
 * vide). Doit être rejeté par `algorithms:['EdDSA']`.
 */
export function forgeAlgNone(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: now, nbf: now, exp: now + 300, jti: payload.requestId }),
  ).toString('base64url');
  return `${header}.${body}.`;
}
