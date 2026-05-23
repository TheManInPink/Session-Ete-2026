/**
 * @file        sanitize.ts
 * @description Anonymisation des données personnelles (PII) avant journalisation.
 *
 *              La plateforme NINA-AES manipule des informations sensibles
 *              (NINA, e-mail, téléphone, photo, parents…). Avant qu'une
 *              entrée soit envoyée vers Loki / Elasticsearch / la console,
 *              elle DOIT passer par {@link sanitizeForLog} pour masquer ces
 *              champs.
 *
 *              Stratégies appliquées :
 *                - NINA : conserve les 2 premiers et 2 derniers caractères.
 *                - Email : masque la partie locale.
 *                - Téléphone : conserve les 4 derniers chiffres.
 *                - Champs sensibles génériques : redaction `[REDACTED]`.
 *                - Récursif sur objets et tableaux.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/utils
 */

import { maskNina } from './nina';

/**
 * Liste (insensible à la casse) des clés d'objet à toujours rédiger
 * intégralement (`[REDACTED]`) avant journalisation.
 */
const REDACT_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'set-cookie',
  'jwt',
  'access_token',
  'refresh_token',
  'apikey',
  'api_key',
  'private_key',
  'biometric_template',
  'photo',
  'pin',
  'otp',
]);

/** Clés dont la valeur sera masquée via {@link maskNina}. */
const NINA_KEYS = new Set(['nina', 'ninaid', 'nina_id']);

/** Clés contenant un e-mail (la valeur sera masquée comme tel). */
const EMAIL_KEYS = new Set(['email', 'mail', 'e_mail']);

/** Clés contenant un numéro de téléphone (4 derniers chiffres conservés). */
const PHONE_KEYS = new Set(['phone', 'tel', 'telephone', 'mobile', 'msisdn']);

/**
 * Masque une adresse e-mail : `j***@example.com`.
 *
 * @param email - Adresse à masquer.
 * @returns Adresse partiellement masquée.
 */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '*'.repeat(email.length);
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local[0] ?? '';
  return `${head}${'*'.repeat(Math.max(1, local.length - 1))}${domain}`;
}

/**
 * Masque un numéro de téléphone : `+223********7842`.
 *
 * @param phone - Numéro à masquer.
 * @returns Numéro partiellement masqué.
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D+/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  const tail = digits.slice(-4);
  const prefix = phone.startsWith('+') ? (phone.match(/^\+\d{1,3}/)?.[0] ?? '+') : '';
  return `${prefix}${'*'.repeat(Math.max(0, digits.length - 4 - prefix.replace(/\D/g, '').length))}${tail}`;
}

/**
 * Anonymise une valeur arbitraire pour journalisation.
 *
 * - `string`/`number`/`boolean`/`null`/`undefined` → renvoyés tels quels
 *   (le masquage dépend de la **clé**, traitée par le caller).
 * - `Array` → mappe récursivement.
 * - `Object` → applique le masquage par clé.
 *
 * @param value - Donnée à nettoyer.
 * @returns Valeur sûre pour journal.
 */
export function sanitizeForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeForLog(v));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [rawKey, raw] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.toLowerCase();

    if (REDACT_KEYS.has(key)) {
      out[rawKey] = '[REDACTED]';
      continue;
    }
    if (NINA_KEYS.has(key) && typeof raw === 'string') {
      out[rawKey] = maskNina(raw);
      continue;
    }
    if (EMAIL_KEYS.has(key) && typeof raw === 'string') {
      out[rawKey] = maskEmail(raw);
      continue;
    }
    if (PHONE_KEYS.has(key) && typeof raw === 'string') {
      out[rawKey] = maskPhone(raw);
      continue;
    }
    out[rawKey] = sanitizeForLog(raw);
  }
  return out;
}
