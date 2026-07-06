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
  | 'goodbye'
  // ── Binding phone↔NINA (2ᵉ facteur SMS) ──
  // `otp_challenge` est NEUTRE : affiché À L'IDENTIQUE que le NINA existe ou
  // non (fermeture de l'oracle d'énumération). Il ne confirme JAMAIS qu'un
  // code a réellement été envoyé. `otp_sent` (legacy, leak d'existence) est
  // CONSERVÉ pour rétro-compat mais N'EST PLUS UTILISÉ par le handler.
  | 'otp_challenge'
  | 'otp_sent'
  | 'enter_otp'
  | 'otp_invalid'
  // ── Anti-énumération (message NEUTRE, ne confirme jamais un NINA) ──
  | 'rate_limited'
  // ── Signalement SIGAC anonyme ──
  | 'alert_notice'
  | 'alert_prompt'
  | 'alert_too_short'
  | 'alert_received';

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

  // ── Binding phone↔NINA (2ᵉ facteur SMS) ────────────────────────────
  // Message NEUTRE servi À L'IDENTIQUE pour « NINA inconnu » et « numéro non
  // lié » : un attaquant ne peut PAS distinguer les deux cas (fermeture de
  // l'oracle d'existence, doc 14 §4.2.2 + §4.5). Ne confirme jamais un envoi.
  otp_challenge: {
    fr: 'Verification requise. Saisissez le code recu par SMS au numero officiel lie a ce NINA.',
    bm: 'Sɛgɛsɛgɛli. SMS code sɛbɛn.',
    snk: 'Suganfin. SMS code (6).',
    ff: 'Ƴeewtaade. Naatnu code SMS.',
    tmq: 'Asensu. Aru code SMS.',
    hau: 'Tabbatarwa. Shigar code SMS.',
    mos: 'Vɛɛnem. SMS code gʋlsi.',
    dje: 'Naanay. SMS code hantum.',
  },
  otp_sent: {
    fr: "Ce numero n'est pas lie a ce NINA. Un code a ete envoye au numero officiel.",
    bm: 'Code cini numero officiel ma.',
    snk: 'Code yi numero officiel.',
    ff: 'Code neldaama numero officiel.',
    tmq: 'Code itwazan i numero officiel.',
    hau: 'An aika code zuwa lambar hukuma.',
    mos: 'Code tʋmsa numero officiel.',
    dje: 'Code samba numero officiel ga.',
  },
  enter_otp: {
    fr: 'Entrez le code recu par SMS :',
    bm: 'SMS code sɛbɛn :',
    snk: 'SMS code (6) :',
    ff: 'Naatnu code SMS :',
    tmq: 'Aru code SMS :',
    hau: 'Shigar code SMS :',
    mos: 'SMS code gʋlsi :',
    dje: 'SMS code hantum :',
  },
  otp_invalid: {
    fr: 'Code incorrect ou expire.',
    bm: 'Code tɛ ɲɛ.',
    snk: 'Code ñaxa.',
    ff: 'Code moƴƴaaki.',
    tmq: 'Code wer iben.',
    hau: 'Code ba daidai ba.',
    mos: 'Code pa zems ye.',
    dje: 'Code si tonton.',
  },

  // ── Anti-énumération : message NEUTRE (ne confirme jamais un NINA) ──
  rate_limited: {
    fr: 'Trop de requetes. Reessayez plus tard.',
    bm: 'Sɛgɛsɛgɛli ka ca. I segin kɔfɛ.',
    snk: 'Yidi gabe. Tugu.',
    ff: 'Naamnde keewi. Fuɗɗo.',
    tmq: 'Aɣiwen aggen. Ales.',
    hau: 'Bukatu sun yawaita. Sake gwadawa.',
    mos: 'Sokr waooga. Lebg n yik.',
    dje: 'Hayyaŋ boobo. Ye ceeci.',
  },

  // ── Signalement SIGAC anonyme ──────────────────────────────────────
  alert_notice: {
    fr: 'Anonyme. Pour plus de surete, utilisez une cabine ou une SIM non nominative.',
    bm: 'Tɔgɔ tɛ. SIM wɛrɛ ka fisa.',
    snk: 'Tɔɔ duun. SIM doɲa.',
    ff: 'Innde alaa. Huutoro SIM goɗɗo.',
    tmq: 'War isem. Sxedem SIM iyyan.',
    hau: 'Babu suna. Yi amfani SIM dabam.',
    mos: 'Yʋʋr ka be ye. Tʋm SIM a to.',
    dje: 'Maa si. SIM fo ka boori.',
  },
  alert_prompt: {
    fr: 'Decrivez le probleme (160 car. max) :',
    bm: 'Gɛlɛya fɔ (160) :',
    snk: 'Yidi sefe (160) :',
    ff: 'Sifo caɗeele (160) :',
    tmq: 'Mel taluft (160) :',
    hau: 'Bayyana matsala (160) :',
    mos: 'Togs yɛlle (160) :',
    dje: 'Ci hari (160) :',
  },
  alert_too_short: {
    fr: 'Description trop courte (10 car. min).',
    bm: 'Sɛbɛn ka surun.',
    snk: 'Sefe doronto.',
    ff: 'Sifo raɓɓiɗi.',
    tmq: 'Taluft tedrest.',
    hau: 'Bayani ya yi gajere.',
    mos: 'Gomd yaa bilfu.',
    dje: 'Ciine kayna.',
  },
  alert_received: {
    fr: 'Signalement recu. Code de suivi : {token}',
    bm: 'Sɛbɛn sɔrɔla. Code : {token}',
    snk: 'Yidi sondi. Code : {token}',
    ff: 'Habrude jaɓaama. Code : {token}',
    tmq: 'Esebd itwasla. Code : {token}',
    hau: 'An karbi rahoto. Code : {token}',
    mos: 'Wagsg paama. Code : {token}',
    dje: 'Ci ta. Code : {token}',
  },
};

/**
 * Récupère un message dans la langue demandée, avec fallback vers le français
 * si la traduction est absente.
 */
export function t(key: MessageKey, lang: SupportedLanguage = 'fr'): string {
  return MESSAGES[key][lang] ?? MESSAGES[key].fr;
}
