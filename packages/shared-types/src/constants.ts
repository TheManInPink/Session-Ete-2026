/**
 * @file        constants.ts
 * @description Constantes métier, regex NINA, langues nationales et seuils de confiance IA.
 * @module      @nina-aes/shared-types
 */

import { AESCountry, Language, PriorityLevel, VulnerabilityCategory } from './enums';

/**
 * Expression régulière du format NINA : 14 chiffres + 1 lettre de contrôle (A–Z).
 */
export const NINA_REGEX = /^\d{14}[A-Z]$/;

/**
 * Représentation textuelle du format NINA pour l’UI (pédagogie citoyenne).
 */
export const NINA_FORMAT_DISPLAY = 'X YY MM R CC CCC CCC A — 14 chiffres + 1 lettre';

/**
 * Vérifie si une chaîne respecte le format NINA **syntaxique** (sans contrôle cryptographique de la lettre).
 *
 * @param value - Chaîne saisie (espaces non tolérés).
 * @returns `true` si le format est valide.
 */
export function isValidNinaFormat(value: string): boolean {
  return NINA_REGEX.test(value.trim());
}

/**
 * Langue supportée avec code projet, ISO 639-1 (lorsque applicable) et libellés.
 */
export interface SupportedLanguageDef {
  /** Code interne {@link Language} */
  code: Language;
  /** Code ISO 639-1 (ou code projet si absent au standard) */
  iso639: string;
  /** Libellé en français */
  labelFr: string;
  /** Libellé dans la langue elle-même */
  labelNative: string;
}

/**
 * Huit langues nationales + français pour l’inclusion (UI, USSD, notifications).
 */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguageDef[] = [
  { code: Language.FR, iso639: 'fr', labelFr: 'Français', labelNative: 'Français' },
  { code: Language.BM, iso639: 'bm', labelFr: 'Bambara', labelNative: 'Bamanankan' },
  { code: Language.SNK, iso639: 'snk', labelFr: 'Soninké', labelNative: 'Soninké' },
  {
    code: Language.FF,
    iso639: 'ff',
    labelFr: 'Peulh (Fulfulde)',
    labelNative: 'Fulfulde',
  },
  { code: Language.TMQ, iso639: 'tmh', labelFr: 'Tamasheq', labelNative: 'Tamasəḥt' },
  { code: Language.HAU, iso639: 'ha', labelFr: 'Hausa', labelNative: 'Hausa' },
  { code: Language.MOS, iso639: 'mos', labelFr: 'Mooré', labelNative: 'Mõõré' },
  {
    code: Language.DJE,
    iso639: 'dje',
    labelFr: 'Songhaï (Djerma)',
    labelNative: 'Songhay',
  },
] as const;

/**
 * Pays AES : code → nom officiel (FR) et ISO 3166-1 alpha-3.
 */
export const AES_COUNTRIES: Record<
  AESCountry,
  { readonly nameFr: string; readonly iso3166Alpha3: string }
> = {
  [AESCountry.MLI]: { nameFr: 'Mali', iso3166Alpha3: 'MLI' },
  [AESCountry.BFA]: { nameFr: 'Burkina Faso', iso3166Alpha3: 'BFA' },
  [AESCountry.NER]: { nameFr: 'Niger', iso3166Alpha3: 'NER' },
};

/**
 * Raccourci USSD documenté (exemple pédagogique — à aligner sur l’opérateur réel).
 */
export const USSD_SHORTCODE = '*123*NINA#';

/**
 * Priorité par défaut selon la catégorie de vulnérabilité (file d’attente).
 */
export const VULNERABILITY_PRIORITIES: Record<VulnerabilityCategory, PriorityLevel> = {
  [VulnerabilityCategory.ELDERLY]: PriorityLevel.P1,
  [VulnerabilityCategory.DISABLED]: PriorityLevel.P1,
  [VulnerabilityCategory.PREGNANT]: PriorityLevel.P1,
  [VulnerabilityCategory.CHRONIC_ILL]: PriorityLevel.P2,
  [VulnerabilityCategory.ILLITERATE]: PriorityLevel.P2,
  [VulnerabilityCategory.DIASPORA]: PriorityLevel.P3,
};

/**
 * Seuils de confiance pour propositions de correction (module IA + validation humaine).
 */
export const CORRECTION_CONFIDENCE_THRESHOLDS = {
  /** Confiance élevée — validation allégée possible selon politique RAVEC */
  HIGH: 85,
  /** Confiance moyenne — revue agent systématique */
  MEDIUM: 60,
} as const;
