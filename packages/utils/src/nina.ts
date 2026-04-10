/**
 * @file        nina.ts
 * @description Fonctions de validation et de parsing du format NINA malien.
 *              Format : 14 chiffres + 1 lettre de contrôle = 15 caractères
 *              Structure : X YY ZZ Z ZZ ZZZ ZZZ A
 * @author      Étudiant UQAR
 * @date        2026
 * @module      utils
 */

/** Expression régulière du format NINA : 14 chiffres suivis d'une lettre majuscule */
const NINA_REGEX = /^[12]\d{13}[A-Z]$/;

/** Structure parsée d'un numéro NINA */
export interface ParsedNina {
  /** Numéro complet (15 caractères) */
  full: string;
  /** Sexe : 1 = Masculin, 2 = Féminin */
  sexe: number;
  /** Année de naissance (2 chiffres) */
  anneeNaissance: string;
  /** Mois de naissance (2 chiffres) */
  moisNaissance: string;
  /** Code région RAVEC (1 chiffre) */
  region: string;
  /** Code cercle RAVEC (2 chiffres) */
  cercle: string;
  /** Code commune RAVEC (3 chiffres) */
  commune: string;
  /** Numéro séquentiel dans la commune (3 chiffres) */
  sequentiel: string;
  /** Lettre de contrôle */
  lettreControle: string;
}

/**
 * Calcule la lettre de contrôle d'un NINA à partir des 14 premiers chiffres.
 *
 * L'algorithme utilise le modulo 23 de la somme pondérée des chiffres,
 * mappé sur l'alphabet (A=0, B=1, ..., W=22, en excluant I et O
 * pour éviter la confusion avec 1 et 0).
 *
 * @param digits - Les 14 premiers chiffres du NINA
 * @returns La lettre de contrôle calculée (A-Z, hors I et O)
 */
export function computeControlLetter(digits: string): string {
  if (!/^\d{14}$/.test(digits)) {
    throw new Error(
      `Les 14 premiers caractères doivent être des chiffres. Reçu : "${digits}"`,
    );
  }

  // Alphabet de contrôle (23 lettres — sans I ni O pour éviter confusion)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  // Somme pondérée : chaque chiffre est multiplié par sa position (1-indexée)
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    sum += parseInt(digits[i]!, 10) * (i + 1);
  }

  return alphabet[sum % 23]!;
}

/**
 * Valide le format complet d'un numéro NINA (15 caractères).
 * Vérifie le format regex ET la cohérence de la lettre de contrôle.
 *
 * @param nina - Le numéro NINA à valider
 * @returns `true` si le NINA est valide, `false` sinon
 */
export function validateNina(nina: string): boolean {
  if (!nina || nina.length !== 15) return false;
  if (!NINA_REGEX.test(nina)) return false;

  const digits = nina.substring(0, 14);
  const expectedLetter = computeControlLetter(digits);

  return nina[14] === expectedLetter;
}

/**
 * Parse un numéro NINA en ses composants structurels.
 *
 * @param nina - Le numéro NINA à parser (15 caractères)
 * @returns L'objet ParsedNina avec chaque composant extrait
 * @throws {Error} Si le format est invalide
 */
export function parseNina(nina: string): ParsedNina {
  if (!NINA_REGEX.test(nina)) {
    throw new Error(`Format NINA invalide : "${nina}"`);
  }

  return {
    full: nina,
    sexe: parseInt(nina[0]!, 10),
    anneeNaissance: nina.substring(1, 3),
    moisNaissance: nina.substring(3, 5),
    region: nina.substring(5, 6),
    cercle: nina.substring(6, 8),
    commune: nina.substring(8, 11),
    sequentiel: nina.substring(11, 14),
    lettreControle: nina[14]!,
  };
}
