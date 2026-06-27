/**
 * @file        bcid.constants.ts
 * @description Constantes figées du protocole BCID-AES v1 (Border Citizen
 *              Identity — Alliance des États du Sahel). Source unique pour les
 *              enums partagés (pays, finalités, verbes, verdicts).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */

/** Pays membres de l'AES (ISO 3166-1 alpha-3). */
export const AES_COUNTRIES = ['MLI', 'BFA', 'NER'] as const;
export type AesCountry = (typeof AES_COUNTRIES)[number];

/**
 * Finalités autorisées (purpose limitation RGPD, ADR-021 §7). Toute valeur
 * hors-liste est rejetée (400) — on ne journalise jamais une finalité inconnue.
 */
export const VERIFY_PURPOSES = [
  'border-control',
  'bank-kyc',
  'school-enrollment',
  'healthcare',
  'marriage-registration',
] as const;
export type VerifyPurpose = (typeof VERIFY_PURPOSES)[number];

/** Algorithme de signature figé (anti algorithm-confusion / "alg:none"). */
export const JWS_ALG = 'EdDSA' as const;

/**
 * Verdict métier journalisé dans `aes_verification_logs.result`.
 *   - MATCH    : NINA connu ET actif.
 *   - NO_MATCH : NINA inconnu.
 *   - REVOKED  : NINA connu mais révoqué (décès, fraude avérée).
 *   - ERROR    : erreur de traitement.
 */
export const VERIFY_RESULTS = ['MATCH', 'NO_MATCH', 'REVOKED', 'ERROR'] as const;
export type VerifyResult = (typeof VERIFY_RESULTS)[number];

/** Type de requête BCID-AES journalisé. */
export const REQUEST_TYPE_VERIFY_NINA = 'IDENTITY_CHECK' as const;

/** Format NINA Mali : 14 chiffres + 1 lettre de contrôle majuscule. */
export const NINA_PATTERN = /^[0-9]{14}[A-Z]$/;
