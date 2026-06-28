/**
 * @file        crypto.util.ts
 * @description Helpers cryptographiques PURS (node:crypto) pour le
 *              governance-service :
 *                - `sha256Hex` : empreinte SHA-256 hexadécimale ;
 *                - `canonicalJson` : sérialisation JSON déterministe (clés triées)
 *                  pour rendre un hash REPRODUCTIBLE indépendamment de l'ordre
 *                  d'insertion ;
 *                - `chainHash` : maillon de hash-chain SHA-256 LINÉAIRE (PAS un
 *                  arbre de Merkle, cf. ADR-007 / SGOGT-PROTOCOL §8.2) reliant un
 *                  événement au précédent (`previousHash | payloadHash`).
 *
 *              Aucune clé secrète ici (la signature est déléguée à Vault Transit,
 *              cf. `JwsSigner`). Ces helpers ne servent qu'à l'INTÉGRITÉ locale.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/common
 */
import { createHash } from 'node:crypto';

/** Hash GENESIS d'une hash-chain (64 zéros hex). */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * SHA-256 hexadécimal d'une chaîne UTF-8.
 *
 * @param input Donnée à hasher.
 * @returns Digest hexadécimal (64 caractères).
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Sérialisation JSON canonique (clés triées récursivement) — base d'un hash
 * reproductible. Les tableaux conservent leur ordre (significatif) ; seules les
 * clés d'objet sont triées.
 *
 * @param value Valeur JSON-sérialisable.
 * @returns Chaîne JSON déterministe.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/** Trie récursivement les clés d'objet (les tableaux gardent leur ordre). */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Calcule le maillon suivant d'une hash-chain SHA-256 LINÉAIRE.
 *
 * @param previousHash Hash du maillon précédent (ou {@link GENESIS_HASH}).
 * @param payload      Charge utile de l'événement courant (objet métier).
 * @returns Hash chaîné `SHA-256(previousHash | canonicalJson(payload))`.
 */
export function chainHash(previousHash: string, payload: unknown): string {
  return sha256Hex(`${previousHash}|${canonicalJson(payload)}`);
}
