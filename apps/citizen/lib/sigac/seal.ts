/**
 * @file        seal.ts
 * @description Scellement (chiffrement) CÔTÉ NAVIGATEUR d'un signalement SIGAC.
 *
 *              Le corps du signalement + la localisation sont chiffrés ICI, dans
 *              le navigateur, AVANT tout envoi réseau. Le serveur ne reçoit qu'un
 *              ciphertext qu'il ne peut PAS déchiffrer (déchiffrement hors-ligne
 *              par le procureur, sur une machine isolée). C'est la garantie de
 *              confidentialité du lanceur d'alerte.
 *
 *              Schéma : libsodium **sealed box** (`crypto_box_seal`, X25519 +
 *              XSalsa20-Poly1305). Une paire éphémère est générée par message
 *              puis jetée → chiffrement à clé publique anonyme, non corrélable.
 *              Interopérable octet-pour-octet avec PyNaCl `SealedBox` côté
 *              backend (les deux enveloppent la même libsodium).
 *
 *              L'encodage base64 utilisé (`base64_variants.ORIGINAL`, standard
 *              avec padding) correspond exactement à `base64.b64encode` (Python).
 *
 * @module      @nina-aes/citizen
 */

import _sodium from 'libsodium-wrappers';

/** Payload en clair, conforme à `_build_payload` du backend (FastAPI). */
export interface SealPayload {
  /** Corps libre du signalement (+ localisation approximative embarquée). */
  message: string;
  /** Classification fine (voyage aussi en clair hors ciphertext, côté requête). */
  classification: string;
  /** Sévérité fine. */
  severity: string;
}

/** Taille attendue d'une clé publique X25519 (octets). */
const X25519_PUBLICKEY_BYTES = 32;

// `libsodium.ready` doit être attendu une seule fois avant tout appel crypto.
let sodiumReady: Promise<typeof _sodium> | null = null;
function getSodium(): Promise<typeof _sodium> {
  if (!sodiumReady) sodiumReady = _sodium.ready.then(() => _sodium);
  return sodiumReady;
}

/**
 * Scelle un payload via libsodium sealed box (X25519).
 *
 * @param payload      Objet en clair `{ message, classification, severity }`.
 * @param publicKeyB64 Clé publique X25519 du procureur, en base64 standard
 *                     (32 octets bruts une fois décodés).
 * @returns Le ciphertext en base64 standard, prêt pour `ciphertext_b64`.
 * @throws  Error si la clé publique est vide ou de taille invalide.
 */
export async function sealReportSealedBoxX25519(
  payload: SealPayload,
  publicKeyB64: string,
): Promise<string> {
  if (!publicKeyB64) {
    throw new Error('Clé publique du procureur indisponible — scellement impossible.');
  }
  const sodium = await getSodium();

  const publicKey = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  if (publicKey.length !== X25519_PUBLICKEY_BYTES) {
    throw new Error('Clé publique X25519 invalide (32 octets attendus).');
  }

  // JSON compact UTF-8 : le procureur le reparse via json.loads (insensible aux
  // espaces), seuls les noms de champs comptent (message/classification/severity).
  const plaintext = sodium.from_string(JSON.stringify(payload));
  const sealed = sodium.crypto_box_seal(plaintext, publicKey);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}
