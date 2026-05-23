/**
 * @file        crypto.ts
 * @description Primitives cryptographiques pour la plateforme NINA-AES.
 *
 *              Fournit :
 *                - Signature JWT RS256 (RSA-2048, SHA-256) — auth interne
 *                  et QR codes des Fiches Descriptives.
 *                - Signature Ed25519 — interopérabilité AES (Mali ↔ Burkina ↔ Niger).
 *                - Hachage SHA-256 d'un template biométrique (digest stocké
 *                  en base, jamais le template brut).
 *
 *              Toutes les fonctions s'appuient exclusivement sur le module
 *              `node:crypto` (zéro dépendance externe).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/utils
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from 'node:crypto';

/** Charge utile JSON sérialisable pour les jetons signés. */
export type JsonObject = Record<string, unknown>;

// ──────────────────────────────────────────────────────────────────────────────
//  Encodage base64url (sans dépendance)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Encode un buffer ou une chaîne en base64url (RFC 4648 §5),
 * c'est-à-dire base64 standard avec `+`→`-`, `/`→`_` et padding `=` retiré.
 *
 * @param input - Donnée à encoder.
 * @returns Chaîne base64url.
 */
function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ──────────────────────────────────────────────────────────────────────────────
//  Signature JWT RS256
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Signe une charge utile avec RS256 (RSASSA-PKCS1-v1_5 + SHA-256) et produit
 * un JWT compact (header.payload.signature).
 *
 * Champs standards automatiquement ajoutés :
 *   - `iat` (issued at)        : timestamp courant (s).
 *   - `exp` (expiration)        : `iat + expiresInSec` si fourni.
 *
 * @param payload - Charge utile JSON (claims). Les champs `iat`/`exp` peuvent
 *                  être pré-remplis par l'appelant et seront préservés.
 * @param privateKey - Clé privée RSA en PEM (string ou KeyObject).
 * @param expiresInSec - Durée de validité en secondes (optionnel).
 * @returns JWT au format `<header>.<payload>.<signature>`.
 */
export function signWithRS256(
  payload: JsonObject,
  privateKey: string | KeyObject,
  expiresInSec?: number,
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims: JsonObject = {
    iat: now,
    ...(expiresInSec ? { exp: now + expiresInSec } : {}),
    ...payload,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(key);

  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Vérifie un JWT RS256 et renvoie sa charge utile décodée si la signature
 * est valide et le jeton non-expiré.
 *
 * @param token - JWT compact à vérifier.
 * @param publicKey - Clé publique RSA en PEM (string ou KeyObject).
 * @returns Charge utile décodée.
 * @throws {Error} Signature invalide, format malformé, ou jeton expiré.
 */
export function verifyRS256(token: string, publicKey: string | KeyObject): JsonObject {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT malformé : 3 segments attendus');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const key = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = Buffer.from(signatureB64, 'base64url');
  if (!verifier.verify(key, signature)) {
    throw new Error('Signature JWT RS256 invalide');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JsonObject;

  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT expiré');
  }

  return payload;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Signature Ed25519 (interopérabilité AES)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Signe une charge utile avec Ed25519 (EdDSA sur courbe Curve25519).
 *
 * Utilisé pour les échanges entre les nœuds AES (Mali, Burkina, Niger) :
 * la signature porte sur la sérialisation JSON canonique de la charge.
 *
 * @param payload - Charge utile JSON.
 * @param privateKey - Clé privée Ed25519 (PEM PKCS8 ou KeyObject).
 * @returns Signature en base64url (sans header — ce n'est pas un JWT).
 */
export function signWithEd25519(payload: JsonObject, privateKey: string | KeyObject): string {
  const key = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
  const message = Buffer.from(JSON.stringify(payload), 'utf8');
  // Ed25519 : `algorithm` doit être null (le digest est implicite).
  const signature = edSign(null, message, key);
  return base64url(signature);
}

/**
 * Vérifie une signature Ed25519 produite par {@link signWithEd25519}.
 *
 * @param payload - Charge utile JSON originale.
 * @param signatureB64 - Signature base64url à vérifier.
 * @param publicKey - Clé publique Ed25519 (PEM ou KeyObject).
 * @returns `true` si la signature est valide.
 */
export function verifyEd25519(
  payload: JsonObject,
  signatureB64: string,
  publicKey: string | KeyObject,
): boolean {
  const key = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
  const message = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = Buffer.from(signatureB64, 'base64url');
  return edVerify(null, message, key, signature);
}

// ──────────────────────────────────────────────────────────────────────────────
//  Hachage de templates biométriques
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Calcule le digest SHA-256 d'un template biométrique pour stockage non-réversible.
 *
 * **Ne jamais stocker le template brut** : seul son digest est conservé en base
 * (Bloc F — Biométrie). Pour la comparaison, on hache le template présenté
 * et on compare les digests.
 *
 * @param template - Template biométrique (Buffer binaire ou base64).
 * @returns Digest SHA-256 hexadécimal (64 caractères).
 */
export function hashBiometric(template: Buffer | string): string {
  const buf = typeof template === 'string' ? Buffer.from(template, 'base64') : template;
  return createHash('sha256').update(buf).digest('hex');
}
