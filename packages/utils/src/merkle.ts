/**
 * @file        merkle.ts
 * @description Fonctions de hachage Merkle pour le journal d'audit immuable.
 *              Chaque entrée d'audit est chaînée à la précédente via SHA-256.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      utils
 */

import { createHash } from 'crypto';

/**
 * Calcule le hash SHA-256 d'une entrée d'audit en la chaînant au hash précédent.
 * Cela forme une chaîne de type Merkle : toute modification d'une entrée
 * passée invalide tous les hash suivants.
 *
 * @param data - Contenu sérialisé de l'entrée d'audit (JSON stringifié)
 * @param previousHash - Hash SHA-256 de l'entrée précédente (chaîne vide pour la première)
 * @returns Hash SHA-256 hexadécimal (64 caractères)
 */
export function computeMerkleHash(data: string, previousHash: string): string {
  return createHash('sha256')
    .update(previousHash + data)
    .digest('hex');
}

/**
 * Alias « orienté générateur » de {@link computeMerkleHash}.
 *
 * Intentionnellement nommé avec l'ordre des paramètres inversé
 * (`previousHash, entryData`) pour correspondre à la signature naturelle
 * « Je génère un hash qui vient APRÈS ce hash précédent ».
 *
 * @param previousHash - Hash SHA-256 de l'entrée précédente (ou `""` pour la première).
 * @param entryData - Contenu de l'entrée courante (déjà sérialisé).
 * @returns Hash SHA-256 hexadécimal (64 caractères).
 */
export function generateMerkleHash(previousHash: string, entryData: string): string {
  return computeMerkleHash(entryData, previousHash);
}

/**
 * Vérifie l'intégrité d'une chaîne d'audit Merkle.
 * Recalcule chaque hash à partir des données et du hash précédent,
 * puis compare avec le hash stocké.
 *
 * @param entries - Tableau d'entrées ordonnées (du plus ancien au plus récent)
 * @returns `true` si la chaîne est intègre, `false` si une falsification est détectée
 */
export function verifyMerkleChain(
  entries: Array<{ data: string; hash: string; previousHash: string }>,
): boolean {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const expectedHash = computeMerkleHash(entry.data, entry.previousHash);

    // Vérifier que le hash stocké correspond au hash recalculé
    if (entry.hash !== expectedHash) {
      return false;
    }

    // Vérifier le chaînage : le previousHash de l'entrée N+1 doit être le hash de l'entrée N
    if (i > 0) {
      const prevEntry = entries[i - 1]!;
      if (entry.previousHash !== prevEntry.hash) {
        return false;
      }
    }
  }

  return true;
}
