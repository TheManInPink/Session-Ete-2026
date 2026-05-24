/**
 * @file        i18n.ts
 * @description Catalogue minimal de traductions du menu USSD pour les 8
 *              langues nationales AES.
 *
 *              POURQUOI inline ici plutôt que dans @nina-aes/i18n :
 *              - USSD impose une contrainte forte (max 182 caractères par
 *                écran). Les chaînes doivent être courtes et adaptées à
 *                cette contrainte, ce qui diffère du i18n web.
 *              - L'étudiant peut itérer rapidement sans toucher au package
 *                partagé. Migration vers @nina-aes/i18n à terme.
 *
 *              CODES LANGUE (ISO 639-3 sauf indication) :
 *              - fr  : français
 *              - bm  : bambara (bambara/bamanankan)
 *              - snk : soninké
 *              - ff  : peul (fulfulde)
 *              - tmq : tamasheq
 *              - hau : haoussa
 *              - mos : mooré
 *              - dje : djerma (zarma)
 *
 *              ⚠️ Les traductions non-FR ci-dessous sont des PLACEHOLDERS.
 *              L'étudiant DOIT les faire valider par des locuteurs natifs
 *              avant tout déploiement. Une mauvaise traduction d'un menu
 *              gouvernemental est pire que pas de traduction du tout.
 *
 * @module      ussd-service/ussd/i18n
 */

/** Codes des langues supportées. */
export type SupportedLanguage = 'fr' | 'bm' | 'snk' | 'ff' | 'tmq' | 'hau' | 'mos' | 'dje';

/** Liste exposée pour les tests et l'introspection. */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'fr',
  'bm',
  'snk',
  'ff',
  'tmq',
  'hau',
  'mos',
  'dje',
];

/** Libellés natifs (pour le menu de sélection de langue). */
export const LANGUAGE_NATIVE_NAMES: Record<SupportedLanguage, string> = {
  fr: 'Français',
  bm: 'Bamanankan',
  snk: 'Sooninké',
  ff: 'Fulfulde',
  tmq: 'Tamasheq',
  hau: 'Hausa',
  mos: 'Mooré',
  dje: 'Zarma',
};

/** Clés des messages disponibles. */
export type MessageKey =
  | 'language_select'
  | 'main_menu'
  | 'enter_nina'
  | 'invalid_nina'
  | 'nina_not_found'
  | 'session_expired'
  | 'internal_error'
  | 'goodbye';

/**
 * Catalogue traductions. Garder chaque chaîne < 160 caractères pour respecter
 * la limite USSD (182 chars avec marge de sécurité).
 */
export const MESSAGES: Record<MessageKey, Record<SupportedLanguage, string>> = {
  language_select: {
    fr: 'NINA-AES\n1. Français\n2. Bamanankan\n3. Sooninké\n4. Fulfulde\n5. Tamasheq\n6. Hausa\n7. Mooré\n8. Zarma',
    bm: 'NINA-AES\nKan sugandi:\n1. Français\n2. Bamanankan\n3. Sooninké\n4. Fulfulde\n5. Tamasheq\n6. Hausa\n7. Mooré\n8. Zarma',
    snk: 'NINA-AES\nXanne suganfin:\n1-8',
    ff: 'NINA-AES\nƊemngal:\n1-8',
    tmq: 'NINA-AES\nAwal:\n1-8',
    hau: 'NINA-AES\nHarshe:\n1-8',
    mos: 'NINA-AES\nGonde:\n1-8',
    dje: 'NINA-AES\nSendaa:\n1-8',
  },
  main_menu: {
    fr: 'NINA-AES — Menu\n1. Vérifier mon NINA\n2. Prendre rendez-vous\n3. Suivre une demande\n4. Signaler un problème\n5. Aide / Langue',
    bm: 'NINA-AES — Yɔrɔ\n1. N ka NINA dɔn\n2. Sigi kɛrɛ\n3. Ɲinin tugu\n4. Gɛlɛya fɔ\n5. Dɛmɛ / Kan',
    snk: 'NINA-AES — Menu\n1-5',
    ff: 'NINA-AES — Menu\n1-5',
    tmq: 'NINA-AES — Menu\n1-5',
    hau: 'NINA-AES — Menu\n1-5',
    mos: 'NINA-AES — Menu\n1-5',
    dje: 'NINA-AES — Menu\n1-5',
  },
  enter_nina: {
    fr: 'Entrez votre NINA (15 caractères) :',
    bm: 'I ka NINA sɛbɛn (caractère 15) :',
    snk: 'NINA sɛbɛnɛ (15) :',
    ff: 'NINA winndu (15) :',
    tmq: 'NINA ăru (15) :',
    hau: 'Shigar da NINA (15) :',
    mos: 'NINA gʋlsi (15) :',
    dje: 'NINA hantum (15) :',
  },
  invalid_nina: {
    fr: 'NINA invalide. Format attendu : 15 caractères (14 chiffres + 1 lettre).',
    bm: 'NINA tɛ ɲɛ. 15 sɛbɛli (14 nɔrɔ + 1 lɛtɛrɛ).',
    snk: 'NINA ñaxa.',
    ff: 'NINA moƴƴaaki.',
    tmq: 'NINA wer iben.',
    hau: 'NINA ba daidai ba.',
    mos: 'NINA pa zems ye.',
    dje: 'NINA si tonton.',
  },
  nina_not_found: {
    fr: 'NINA introuvable dans la base. Vérifiez vos saisies.',
    bm: 'NINA ma sɔrɔ.',
    snk: 'NINA n’an sondi.',
    ff: 'NINA tawaaka.',
    tmq: 'NINA ur ihlek.',
    hau: 'NINA ba a samu ba.',
    mos: 'NINA pa be ye.',
    dje: 'NINA si bara.',
  },
  session_expired: {
    fr: 'Session expirée. Recomposez *123*NINA#.',
    bm: 'Waati banna. *123*NINA# segin.',
    snk: 'Waxati ban.',
    ff: 'Sahaa timmii.',
    tmq: 'Akud ifu.',
    hau: 'Zama ya kare.',
    mos: 'Sãam-sãama saa.',
    dje: 'Alwaati ban.',
  },
  internal_error: {
    fr: 'Erreur technique. Réessayez plus tard.',
    bm: 'Fili kɛra. I segin kɔfɛ.',
    snk: 'Filankunlu.',
    ff: 'Juumre ngonnde.',
    tmq: 'Tuksiwen.',
    hau: 'Matsala.',
    mos: 'Yel-pakr be.',
    dje: 'Hayni.',
  },
  goodbye: {
    fr: 'Merci. NINA-AES.',
    bm: 'I ni ce. NINA-AES.',
    snk: 'Aw barika.',
    ff: 'A jaaraama.',
    tmq: 'Tanemmirt.',
    hau: 'Na gode.',
    mos: 'Y pẽ-y maan.',
    dje: 'Foofo.',
  },
};

/**
 * Récupère un message dans la langue demandée, avec fallback vers le français
 * si la traduction est absente.
 */
export function t(key: MessageKey, lang: SupportedLanguage = 'fr'): string {
  return MESSAGES[key][lang] ?? MESSAGES[key].fr;
}
