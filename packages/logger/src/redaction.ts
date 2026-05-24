/**
 * @file        redaction.ts
 * @description Règles de masquage des données personnelles (PII) avant log.
 *
 *              POURQUOI : la plateforme NINA-AES traite des identifiants
 *              régaliens (NINA), des données biométriques (hashes), des
 *              authentifiants (JWT, mots de passe), des numéros de téléphone
 *              et e-mails. Ces données ne doivent JAMAIS apparaître en clair
 *              dans les logs, pour deux raisons :
 *
 *              1. Conformité (RGPD-like CEDEAO, loi malienne 2017-070 sur la
 *                 protection des données personnelles).
 *              2. Sécurité (un dump de logs ne doit pas être un raccourci
 *                 vers une base de citoyens — cf. fuite Aadhaar 2018).
 *
 *              On utilise le mécanisme `redact` natif de Pino, qui parcourt
 *              chaque ligne et masque les chemins déclarés. C'est plus rapide
 *              et plus sûr qu'un post-processing applicatif.
 *
 * @module      @nina-aes/logger/redaction
 */

/**
 * Liste exhaustive des chemins (notation Pino) à masquer automatiquement.
 *
 * Notation `*` : wildcard sur un niveau. Notation `[*]` : wildcard array.
 *
 * AJOUTER PRUDEMMENT : tout nouveau champ susceptible de contenir des PII
 * doit être ajouté ici AVANT le premier déploiement du service qui l'utilise.
 * Le test `redaction.spec.ts` doit échouer si un nouveau champ PII est introduit
 * sans masquage correspondant.
 */
export const PII_REDACT_PATHS: readonly string[] = [
  // === Authentification ===
  'password',
  '*.password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'token',
  '*.token',
  'accessToken',
  'refreshToken',
  'idToken',
  'authorization',
  '*.authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'cookie',
  '*.cookie',
  'apiKey',
  '*.apiKey',
  'jwt',
  'mfaSecret',
  'totpSecret',
  'otp',

  // === Identifiants régaliens ===
  // NINA brut interdit dans les logs — utiliser maskNina() en amont
  'nina',
  '*.nina',
  'ninaRaw',
  'targetNina',
  'requestedNina',
  'currentNina',

  // === Biométrie ===
  // Aucune empreinte ne doit transiter en log, hashée ou non
  'fingerprint',
  'fingerprintTemplate',
  'fingerprintHash',
  '*.fingerprintHash',
  'biometricTemplate',
  'biometricHash',
  '*.biometricHash',
  'photo',
  'photoBase64',

  // === Données de contact (à masquer partiellement, voir maskers ci-dessous) ===
  'email',
  '*.email',
  'phoneNumber',
  '*.phoneNumber',
  'phone',

  // === Données d'état civil sensibles ===
  // Date de naissance autorisée car nécessaire à debug ; nom complet à masquer
  // si pas déjà passé par maskName() applicatif
  'firstName',
  '*.firstName',
  'lastName',
  '*.lastName',
  'parentName',
  'motherMaidenName',

  // === Secrets infrastructure ===
  'vaultToken',
  'dbPassword',
  'redisPassword',
  'rabbitMqPassword',
  'minioSecretKey',
  'keycloakClientSecret',

  // === Signatures et clés ===
  'privateKey',
  '*.privateKey',
  'signingKey',
  // publicKey OK à garder en log (par définition publique)
];

/**
 * Censorship token utilisé par Pino — affiché à la place de la valeur masquée.
 * Choisi explicitement reconnaissable pour faciliter le grep en investigation.
 */
export const REDACT_CENSOR = '[REDACTED]';

/**
 * Masque un NINA en gardant uniquement le 1er caractère (sexe) et le dernier
 * (lettre de contrôle), remplaçant les 13 chiffres centraux par des étoiles.
 *
 * QUOI : transforme `1721234567890A` en `1*************A`.
 * POURQUOI : permet à l'opérateur ops de différencier deux NINA différents
 * dans une investigation (premiers caractères = sexe et année varient) sans
 * exposer l'identifiant complet à quiconque a accès à Loki.
 *
 * @param nina - NINA brut (15 caractères attendus).
 * @returns NINA masqué, ou la chaîne `[invalid-nina]` si format incorrect.
 *
 * @example
 *   maskNina('1721234567890A') === '1*************A';
 *   maskNina('abc')             === '[invalid-nina]';
 */
export function maskNina(nina: unknown): string {
  if (typeof nina !== 'string' || nina.length !== 15) {
    return '[invalid-nina]';
  }
  // On garde X (sexe) + masque + A (lettre de contrôle).
  // charAt() au lieu de [n] pour satisfaire noUncheckedIndexedAccess (TS strict).
  return `${nina.charAt(0)}${'*'.repeat(13)}${nina.charAt(14)}`;
}

/**
 * Masque un numéro de téléphone en gardant le préfixe pays et les 2 premiers
 * chiffres locaux, remplaçant le reste par des étoiles.
 *
 * @param phone - Numéro brut (formats acceptés : `+22366123456`, `0066123456`).
 * @returns Numéro masqué, ex. `+22366******`.
 */
export function maskPhone(phone: unknown): string {
  if (typeof phone !== 'string' || phone.length < 6) {
    return '[invalid-phone]';
  }
  // On garde le préfixe `+xxx` ou `00xxx` + 2 chiffres
  const m = phone.match(/^(\+\d{3}|0{2}\d{3})(\d{2})/);
  // m[0] = correspondance complète garantie non-undefined si m est défini,
  // mais le typage strict de noUncheckedIndexedAccess l'oblige malgré tout.
  if (!m || m[0] === undefined) return '[invalid-phone]';
  const visiblePart = m[0];
  const maskedCount = phone.length - visiblePart.length;
  return `${visiblePart}${'*'.repeat(Math.max(0, maskedCount))}`;
}

/**
 * Masque une adresse e-mail en remplaçant le local part par des étoiles
 * sauf la première lettre.
 *
 * @example
 *   maskEmail('mamadou@example.ml') === 'm******@example.ml';
 */
export function maskEmail(email: unknown): string {
  if (typeof email !== 'string' || !email.includes('@')) {
    return '[invalid-email]';
  }
  const [local, domain] = email.split('@');
  if (!local || local.length === 0 || !domain) return '[invalid-email]';
  return `${local.charAt(0)}${'*'.repeat(Math.max(0, local.length - 1))}@${domain}`;
}
