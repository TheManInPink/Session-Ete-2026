/**
 * @file        nina.ts
 * @description Fonctions de validation et de manipulation du format NINA malien.
 *
 *              Format : 14 chiffres + 1 lettre de contrôle = 15 caractères.
 *              Structure : `X YY ZZ Z ZZ ZZZ ZZZ A` où :
 *                - `X`   : sexe (1 = masculin, 2 = féminin)
 *                - `YY`  : année de naissance (2 chiffres)
 *                - `ZZ`  : mois de naissance (2 chiffres)
 *                - `Z`   : code région RAVEC
 *                - `ZZ`  : code cercle
 *                - `ZZZ` : code commune
 *                - `ZZZ` : séquentiel dans la commune
 *                - `A`   : lettre de contrôle modulo 23
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/utils
 */

/** Expression régulière du format NINA : 14 chiffres suivis d'une lettre majuscule. */
const NINA_REGEX = /^[12]\d{13}[A-Z]$/;

/**
 * Alphabet de contrôle (23 lettres — sans `I` ni `O` pour éviter
 * la confusion avec les chiffres `1` et `0`).
 */
const CONTROL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Structure parsée d'un numéro NINA. */
export interface ParsedNina {
  /** Numéro complet (15 caractères). */
  full: string;
  /** Sexe : 1 = Masculin, 2 = Féminin. */
  sexe: number;
  /** Année de naissance (2 chiffres). */
  anneeNaissance: string;
  /** Mois de naissance (2 chiffres). */
  moisNaissance: string;
  /** Code région RAVEC (1 chiffre). */
  region: string;
  /** Code cercle RAVEC (2 chiffres). */
  cercle: string;
  /** Code commune RAVEC (3 chiffres). */
  commune: string;
  /** Numéro séquentiel dans la commune (3 chiffres). */
  sequentiel: string;
  /** Lettre de contrôle. */
  lettreControle: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Normalisation & formatage
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Normalise un NINA pour comparaison : supprime les espaces / tirets et passe
 * en majuscules. À utiliser **avant** validation ou stockage.
 *
 * @param input - Saisie utilisateur brute (peut contenir espaces, tirets, minuscules).
 * @returns NINA normalisé (caractères alphanumériques majuscules uniquement).
 */
export function normalizeNina(input: string): string {
  return (input ?? '').replace(/[\s\-_.]+/g, '').toUpperCase();
}

/**
 * Formate un NINA pour affichage lisible : `X YY ZZ Z ZZ ZZZ ZZZ A`.
 * Accepte un NINA brut ou déjà formaté.
 *
 * @param nina - NINA en 15 caractères.
 * @returns Chaîne formatée avec espaces, ou la chaîne normalisée si < 15 caractères.
 */
export function formatNina(nina: string): string {
  const n = normalizeNina(nina);
  if (n.length !== 15) return n;
  return `${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n[5]} ${n.slice(6, 8)} ${n.slice(8, 11)} ${n.slice(11, 14)} ${n[14]}`;
}

/**
 * Masque un NINA pour les journaux et affichages publics : conserve les
 * premiers et derniers caractères, remplace le reste par des `*`.
 *
 * Par défaut, 2 caractères en tête et 2 en queue sont visibles.
 *
 * @param nina - NINA à masquer.
 * @param visibleStart - Nombre de caractères visibles au début (défaut 2).
 * @param visibleEnd - Nombre de caractères visibles à la fin (défaut 2).
 * @returns NINA partiellement masqué (`12***********8A`).
 */
export function maskNina(nina: string, visibleStart = 2, visibleEnd = 2): string {
  const n = normalizeNina(nina);
  if (n.length === 0) return '';
  if (n.length <= visibleStart + visibleEnd) return '*'.repeat(n.length);
  const head = n.slice(0, visibleStart);
  const tail = n.slice(n.length - visibleEnd);
  const masked = '*'.repeat(n.length - visibleStart - visibleEnd);
  return head + masked + tail;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Calcul & validation de la lettre de contrôle
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Calcule la lettre de contrôle d'un NINA à partir des 14 premiers chiffres.
 *
 * Algorithme : somme pondérée (chaque chiffre × (position 1-indexée)),
 * modulo 23, mappée sur `CONTROL_ALPHABET` (A=0…W=22, sans I ni O).
 *
 * @param digits - Les 14 premiers chiffres du NINA.
 * @returns Lettre de contrôle attendue (A-Z hors I et O).
 * @throws {Error} Si `digits` n'est pas composé de 14 chiffres exactement.
 */
export function computeControlLetter(digits: string): string {
  if (!/^\d{14}$/.test(digits)) {
    throw new Error(`Les 14 premiers caractères doivent être des chiffres. Reçu : "${digits}"`);
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    sum += parseInt(digits[i]!, 10) * (i + 1);
  }

  return CONTROL_ALPHABET[sum % 23]!;
}

/**
 * Valide le format et la cohérence de la lettre de contrôle d'un NINA.
 *
 * Applique d'abord {@link normalizeNina} pour tolérer les espaces/tirets.
 *
 * @param nina - NINA à valider.
 * @returns `true` si le format est valide **et** la lettre de contrôle correcte.
 */
export function validateNina(nina: string): boolean {
  const n = normalizeNina(nina);
  if (n.length !== 15 || !NINA_REGEX.test(n)) return false;
  return n[14] === computeControlLetter(n.substring(0, 14));
}

/**
 * Alias explicite de {@link validateNina} — nommé pour la clarté sémantique
 * quand on veut souligner qu'on vérifie bien la **lettre de contrôle finale**.
 *
 * @param nina - NINA à vérifier.
 * @returns `true` si la lettre de contrôle correspond au calcul attendu.
 */
export function validateNinaChecksum(nina: string): boolean {
  return validateNina(nina);
}

/**
 * Parse un numéro NINA en ses composants structurels.
 *
 * @param nina - NINA à parser (peut être formaté avec espaces).
 * @returns Objet {@link ParsedNina}.
 * @throws {Error} Si le format est invalide.
 */
export function parseNina(nina: string): ParsedNina {
  const n = normalizeNina(nina);
  if (!NINA_REGEX.test(n)) {
    throw new Error(`Format NINA invalide : "${nina}"`);
  }

  return {
    full: n,
    sexe: parseInt(n[0]!, 10),
    anneeNaissance: n.substring(1, 3),
    moisNaissance: n.substring(3, 5),
    region: n.substring(5, 6),
    cercle: n.substring(6, 8),
    commune: n.substring(8, 11),
    sequentiel: n.substring(11, 14),
    lettreControle: n[14]!,
  };
}
