/**
 * @file        index.ts
 * @description Utilitaires partagés de la NINA-AES Platform.
 *              Inclut : validation NINA, calcul de la lettre de contrôle,
 *              hashing Merkle, utilitaire de classes CSS.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      utils
 */

export { validateNina, computeControlLetter, parseNina } from './nina';
export { computeMerkleHash, verifyMerkleChain } from './merkle';
export { cn } from './cn';
