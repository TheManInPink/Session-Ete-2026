/**
 * @file        index.ts
 * @description Configuration partagée next-intl pour les 8 langues nationales.
 *              Aligné sur l'enum `Language` de `@nina-aes/shared-types`.
 *
 *              Codes : FR (français), BM (bamanankan), SNK (soninké),
 *              FF (fulfulde), TMQ (tamasheq), HAU (hausa), MOS (mooré), DJE (zarma).
 *
 *              Note : `next-intl` impose des codes lowercase dans les URLs
 *              (`/fr/`, `/bm/`, …), différents de l'enum projet `Language` qui
 *              est en uppercase.
 *
 * @module      @nina-aes/i18n
 */

import { Language, SUPPORTED_LANGUAGES } from '@nina-aes/shared-types';

/** Codes langue lowercase utilisés dans les URLs Next.js (`/fr/dashboard`). */
export const locales = ['fr', 'bm', 'snk', 'ff', 'tmq', 'hau', 'mos', 'dje'] as const;

export type Locale = (typeof locales)[number];

/** Fallback si la locale demandée n'est pas supportée. */
export const defaultLocale: Locale = 'fr';

/** Mapping `Locale` (URL) → `Language` (enum partagé). */
export const localeToLanguage: Record<Locale, Language> = {
  fr: Language.FR,
  bm: Language.BM,
  snk: Language.SNK,
  ff: Language.FF,
  tmq: Language.TMQ,
  hau: Language.HAU,
  mos: Language.MOS,
  dje: Language.DJE,
};

/** Inverse : `Language` → `Locale`. */
export const languageToLocale: Record<Language, Locale> = {
  [Language.FR]: 'fr',
  [Language.BM]: 'bm',
  [Language.SNK]: 'snk',
  [Language.FF]: 'ff',
  [Language.TMQ]: 'tmq',
  [Language.HAU]: 'hau',
  [Language.MOS]: 'mos',
  [Language.DJE]: 'dje',
};

/** Libellé à afficher dans le sélecteur de langue (nom dans la langue elle-même). */
export const localeLabels: Record<Locale, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [languageToLocale[l.code], l.labelNative]),
) as Record<Locale, string>;

/** Emoji drapeau (Mali — toutes les langues nationales sont couvertes par le Mali). */
export const localeFlags: Record<Locale, string> = {
  fr: '🇲🇱',
  bm: '🇲🇱',
  snk: '🇲🇱',
  ff: '🇲🇱',
  tmq: '🇲🇱',
  hau: '🇲🇱',
  mos: '🇧🇫',
  dje: '🇳🇪',
};

/** Détection d'une chaîne arbitraire pour la transformer en `Locale` valide. */
export function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return defaultLocale;
  const lower = input.toLowerCase();
  return (locales as readonly string[]).includes(lower) ? (lower as Locale) : defaultLocale;
}
