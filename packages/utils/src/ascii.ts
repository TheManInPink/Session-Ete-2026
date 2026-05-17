/**
 * @file        ascii.ts
 * @description Helpers de normalisation ASCII pour la recherche fuzzy.
 *
 *              Utilisé par identity-service (recherche citoyens) et
 *              ai-service (matching phonétique des noms maliens).
 *
 *              Stratégie :
 *                1. NFD decomposition (séparation lettre/accent)
 *                2. Suppression des diacritiques (catégorie Unicode Mn)
 *                3. Lowercase
 *                4. Conservation des espaces et tirets (utiles pour tokenisation)
 *
 *              Exemple : "Mamadou Traoré" → "mamadou traore"
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/utils
 */

/**
 * Convertit une chaîne en ASCII normalisée pour recherche fuzzy.
 *
 * @param input - Texte UTF-8 (ex. "Sékou Touré")
 * @returns Texte ASCII lowercase sans accents (ex. "sekou toure")
 *
 * @example
 *   toAscii('Mamadou Traoré')       // → 'mamadou traore'
 *   toAscii('SÉGOU')                 // → 'segou'
 *   toAscii('Ségou-Carrefour')       // → 'segou-carrefour'
 *   toAscii('')                      // → ''
 */
export function toAscii(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques Unicode
    .toLowerCase()
    .trim();
}
