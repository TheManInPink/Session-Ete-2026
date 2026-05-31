/**
 * @file        env.schema.ts
 * @description Schéma Zod des variables d'environnement du notification-service.
 *              Échoue au démarrage (fail-fast) si une variable est
 *              invalide/absente — aucun défaut implicite enfoui dans le code.
 *
 *              ⚠️  Secrets (AT_API_KEY, SMTP_PASSWORD, credentials FCM) : en
 *              développement ils proviennent du `.env` racine ; en production
 *              ils sont injectés dans l'environnement par **Vault Agent**
 *              (sidecar) qui matérialise les secrets KV → variables process.
 *              L'application ne lit jamais Vault directement ici (cf. doc 15
 *              Security Hardening). Aucun secret n'est codé en dur.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/config
 */
import { z } from 'zod';

/**
 * Parseur booléen tolérant : `z.coerce.boolean()` renvoie `true` pour toute
 * chaîne non vide (y compris `"false"`), ce qui est piégeux pour des flags
 * `XXX=false`. On normalise explicitement les valeurs vraies.
 *
 * @param def Valeur par défaut si la variable est absente.
 */
const zBool = (def: boolean) =>
  z
    .preprocess((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
      return def;
    }, z.boolean())
    .default(def);

/** Schéma typé de l'environnement notification-service. */
export const envSchema = z.looseObject({
  // ── Réseau ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  NOTIFICATION_SERVICE_PORT: z.coerce.number().int().positive().default(3005),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Base de données (historique des notifications) ────────────────────
  DATABASE_URL: z.url(),

  // ── JWT (vérification RS256 via JWKS d'auth-service) ──────────────────
  AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),

  // ── RabbitMQ ──────────────────────────────────────────────────────────
  RABBITMQ_URL: z.url().default('amqp://localhost:5672'),
  /** Exchange topic des notifications (cf. infrastructure/.../definitions.json). */
  RABBITMQ_NOTIFICATIONS_EXCHANGE: z.string().default('nina.notifications'),
  /** Dead-letter exchange (échecs définitifs → file `dlx.parking`). */
  RABBITMQ_DLX_EXCHANGE: z.string().default('nina.dlx'),
  /** Files de travail consommées (une par canal + la file de ré-essai). */
  RABBITMQ_SMS_QUEUE: z.string().default('notification.sms'),
  RABBITMQ_EMAIL_QUEUE: z.string().default('notification.email'),
  RABBITMQ_USSD_QUEUE: z.string().default('notification.ussd'),
  RABBITMQ_PUSH_QUEUE: z.string().default('notification.push'),
  /** File de ré-injection : reçoit les messages relâchés par les files de délai. */
  RABBITMQ_WORK_QUEUE: z.string().default('notification.work'),
  /** Nombre de messages en vol par consumer ⇒ degré de parallélisme des workers. */
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(16),
  /** Active la consommation RabbitMQ (désactivable en test/CI). */
  RABBITMQ_CONSUMER_ENABLED: zBool(true),

  // ── Politique de ré-essai (back-off exponentiel avant DLQ) ────────────
  /**
   * Délais (ms) entre tentatives, en CSV. Une file de délai TTL est créée par
   * palier. Au-delà du dernier palier → message envoyé en DLQ.
   * Défaut : 1 min, 5 min, 30 min, 2 h, 12 h.
   */
  NOTIFICATION_RETRY_DELAYS_MS: z.string().default('60000,300000,1800000,7200000,43200000'),

  // ── Africa's Talking (SMS — Mali, Burkina, Niger) ─────────────────────
  /** Clé API (sandbox en dev, clé live injectée par Vault Agent en prod). */
  AT_API_KEY: z.string().default('sandbox-api-key'),
  /** Nom d'utilisateur AT ; `sandbox` ⇒ endpoint bac-à-sable détecté auto. */
  AT_USERNAME: z.string().default('sandbox'),
  /** Identifiant d'expéditeur (sender ID alphanumérique enregistré). */
  AT_SMS_SENDER_ID: z.string().default('NINA-AES'),
  /** URL de base optionnelle (sinon dérivée du username sandbox/live). */
  AT_BASE_URL: z.string().optional(),
  /** Coupe-circuit : `false` ⇒ aucun appel réseau réel (CI, tests). */
  AT_SMS_ENABLED: zBool(true),
  /** Secret partagé attendu sur le webhook DLR (query `?token=` ou header). */
  NOTIFICATION_ATALKING_CALLBACK_SECRET: z.string().default(''),

  // ── SMTP (email — Maildev en dev) ─────────────────────────────────────
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: zBool(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM: z.string().default('NINA-AES <noreply@nina-aes.ml>'),
  /** Coupe-circuit email (CI/tests). */
  SMTP_ENABLED: zBool(true),

  // ── Push (FCM HTTP v1 — Android + iOS via APNS proxifié par Firebase) ─
  /** Active l'envoi FCM réel ; `false` ⇒ provider de dev (log, succès simulé). */
  FCM_ENABLED: zBool(false),
  /** Identifiant de projet Firebase (`projects/<id>/messages:send`). */
  FCM_PROJECT_ID: z.string().default(''),
  /** JSON (ou chemin) du compte de service Firebase — injecté par Vault en prod. */
  FCM_SERVICE_ACCOUNT: z.string().default(''),

  // ── Throttle HTTP (protection des endpoints) ──────────────────────────
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  /** Débit max d'un broadcast (notifications/seconde) — protège les fournisseurs. */
  NOTIFICATION_BROADCAST_RATE_PER_SEC: z.coerce.number().int().positive().default(20),

  // ── Langue ────────────────────────────────────────────────────────────
  DEFAULT_LANGUAGE: z.enum(['FR', 'BM', 'SNK', 'FF', 'TMQ', 'HAU', 'MOS', 'DJE']).default('FR'),
});

/** Type inféré de l'environnement validé. */
export type Env = z.infer<typeof envSchema>;

/**
 * Valide `process.env` au démarrage et renvoie l'objet typé.
 *
 * @param raw Variables brutes (`process.env`).
 * @returns Environnement validé et typé.
 * @throws Error agrégée si une variable est invalide/absente.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'} : ${i.message}`)
      .join('\n');
    throw new Error(`[notification-service] Configuration invalide :\n${lines}`);
  }
  return parsed.data;
}
