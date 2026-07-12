/**
 * @file        env.schema.ts
 * @description Schéma Zod des variables d'environnement de l'appointment-service.
 *              Échoue au démarrage (fail-fast) si une variable est
 *              invalide/absente — aucun défaut implicite enfoui dans le code.
 *
 *              ⚠️  Secrets : aucun secret propre au service. Les credentials
 *              PostgreSQL (DATABASE_URL), Redis (REDIS_URL) et RabbitMQ
 *              (RABBITMQ_URL) proviennent du `.env` racine en développement et
 *              sont injectés par **Vault Agent** (sidecar) en production
 *              (cf. doc 15 Security Hardening).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/config
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

/** Schéma typé de l'environnement appointment-service. */
export const envSchema = z.looseObject({
  // ── Réseau ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APPOINTMENT_SERVICE_PORT: z.coerce.number().int().positive().default(3008),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Base de données (centres, rendez-vous) ────────────────────────────
  DATABASE_URL: z.url(),

  // ── JWT (vérification RS256 via JWKS d'auth-service) ──────────────────
  AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),

  // ── Redis (file d'attente virtuelle + blacklist no-show) ──────────────
  REDIS_URL: z.url().default('redis://localhost:6379'),
  /** Préfixe de toutes les clés Redis (cloisonnement multi-service). */
  REDIS_KEY_PREFIX: z.string().default('appointment:'),

  // ── RabbitMQ (publication des rappels vers notification-service) ──────
  RABBITMQ_URL: z.url().default('amqp://localhost:5672'),
  /** Exchange topic des notifications (cf. infrastructure/.../definitions.json). */
  RABBITMQ_NOTIFICATIONS_EXCHANGE: z.string().default('nina.notifications'),
  /** Active la publication RabbitMQ (désactivable en test/CI). */
  APPOINTMENT_NOTIFICATIONS_ENABLED: zBool(true),
  /** Exchange topic des événements métier consommé par audit-service (hash-chain). */
  RABBITMQ_EVENTS_EXCHANGE: z.string().default('nina.events'),
  /** Active la publication des événements d'audit vers audit-service (test/CI off). */
  APPOINTMENT_AUDIT_ENABLED: zBool(true),

  // ── Politique de rendez-vous ──────────────────────────────────────────
  /** Délai de grâce (min) après l'heure prévue avant de marquer NO_SHOW. */
  APPOINTMENT_NOSHOW_GRACE_MIN: z.coerce.number().int().nonnegative().default(30),
  /** Nombre de no-shows (fenêtre glissante) déclenchant la blacklist. */
  APPOINTMENT_NOSHOW_THRESHOLD: z.coerce.number().int().positive().default(2),
  /** Fenêtre glissante (jours) de comptage des no-shows. */
  APPOINTMENT_NOSHOW_WINDOW_DAYS: z.coerce.number().int().positive().default(90),
  /** Durée de la blacklist temporaire (heures) après dépassement du seuil. */
  APPOINTMENT_BLACKLIST_TTL_HOURS: z.coerce.number().int().positive().default(48),
  /** Horizon maximal de réservation à l'avance (jours). */
  APPOINTMENT_BOOKING_HORIZON_DAYS: z.coerce.number().int().positive().default(30),

  // ── Tâches planifiées (rappels J-1/H-2 + balayage no-show) ────────────
  /** Active le cron de rappels + no-show (désactivable en test/CI). */
  APPOINTMENT_CRON_ENABLED: zBool(true),
  /**
   * Largeur (unilatérale) de la fenêtre de déclenchement d'un rappel (min) :
   * le cron sélectionne les RDV dont l'heure tombe dans [seuil, seuil + largeur[.
   * Doit être STRICTEMENT SUPÉRIEURE à l'intervalle du cron (10 min) pour que
   * les fenêtres successives se CHEVAUCHENT — sinon un tick manqué (redémarrage,
   * GC) laisse un trou et des rappels ne sont jamais émis. Le chevauchement
   * produit des doublons, neutralisés par l'idempotence côté notification-service
   * (clé `appt:<id>:reminder-*`). Défaut 15 min ⇒ ~5 min de recouvrement.
   */
  APPOINTMENT_REMINDER_WINDOW_MIN: z.coerce.number().int().positive().default(15),

  // ── Throttle HTTP (protection des endpoints) ──────────────────────────
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

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
    throw new Error(`[appointment-service] Configuration invalide :\n${lines}`);
  }
  return parsed.data;
}
