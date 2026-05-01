/**
 * @file        index.ts
 * @description Point d'entrée public du package `@nina-aes/utils`.
 *
 *              Regroupe les utilitaires partagés par les microservices et
 *              les frontaux :
 *                - Manipulation et validation du format NINA malien.
 *                - Hachage Merkle pour les journaux d'audit chaînés.
 *                - Primitives cryptographiques (RS256, Ed25519, biométrie).
 *                - Calculs de dates (âge).
 *                - Anonymisation des données personnelles avant journalisation.
 *                - Helper CSS `cn()` pour les composants React partagés.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/utils
 */

// ── NINA ───────────────────────────────────────────────────────────────────────
export {
  computeControlLetter,
  formatNina,
  maskNina,
  normalizeNina,
  parseNina,
  validateNina,
  validateNinaChecksum,
  type ParsedNina,
} from './nina';

// ── Audit / Merkle ─────────────────────────────────────────────────────────────
export { computeMerkleHash, generateMerkleHash, verifyMerkleChain } from './merkle';

// ── Cryptographie ──────────────────────────────────────────────────────────────
export {
  hashBiometric,
  signWithEd25519,
  signWithRS256,
  verifyEd25519,
  verifyRS256,
  type JsonObject,
} from './crypto';

// ── Dates ──────────────────────────────────────────────────────────────────────
export { calculateAge } from './date';

// ── Sécurité / journalisation ──────────────────────────────────────────────────
export { sanitizeForLog } from './sanitize';

// ── UI ─────────────────────────────────────────────────────────────────────────
export { cn } from './cn';
