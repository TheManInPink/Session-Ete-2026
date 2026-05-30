/**
 * @file        env.schema.ts
 * @description Schéma Zod des variables d'environnement du audit-service.
 *              Échoue au démarrage (fail-fast) si une variable est
 *              invalide/absente — aucun défaut implicite enfoui dans le code
 *              applicatif.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/config
 */
import { z } from 'zod';

/** Schéma typé de l'environnement audit-service. */
export const envSchema = z.looseObject({
  // ── Réseau ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  AUDIT_SERVICE_PORT: z.coerce.number().int().positive().default(3007),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Base de données ───────────────────────────────────────────────────
  DATABASE_URL: z.url(),

  // ── JWT (vérification RS256 via JWKS d'auth-service) ──────────────────
  AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),

  // ── RabbitMQ (consommation des événements à auditer) ──────────────────
  RABBITMQ_URL: z.url().default('amqp://localhost:5672'),
  /** Exchange fanout dédié à l'audit explicite (cf. infrastructure/.../definitions.json). */
  RABBITMQ_AUDIT_EXCHANGE: z.string().default('nina.audit'),
  /** Exchange topic des événements métier (citizen.*, correction.*, …). */
  RABBITMQ_EVENTS_EXCHANGE: z.string().default('nina.events'),
  /** Queue durable consommée par ce service. */
  RABBITMQ_AUDIT_QUEUE: z.string().default('audit.log'),
  /** Nombre de messages non-ack autorisés en vol (alimente le batch). */
  RABBITMQ_AUDIT_PREFETCH: z.coerce.number().int().positive().default(1000),
  /**
   * Patterns de routing à lier sur l'exchange topic des événements métier.
   * Liste CSV. `#` capturerait tout ; on reste explicite pour ne journaliser
   * que les domaines pertinents.
   */
  AUDIT_EVENT_PATTERNS: z
    .string()
    .default(
      'citizen.#,correction.#,agent.#,governance.#,document.#,identity.#,appointment.#,vulnerability.#,interop.#',
    ),
  /** Active la consommation RabbitMQ (désactivable en test/CI). */
  RABBITMQ_CONSUMER_ENABLED: z.coerce.boolean().default(true),

  // ── Batching (perf : insertion groupée) ───────────────────────────────
  AUDIT_BATCH_MAX_SIZE: z.coerce.number().int().positive().default(1000),
  AUDIT_BATCH_INTERVAL_MS: z.coerce.number().int().positive().default(500),

  // ── Vault (clé Ed25519 de scellement de racine) ───────────────────────
  VAULT_ADDR: z.url().default('http://localhost:8200'),
  VAULT_TOKEN: z.string().default('nina-dev-root-token'),
  /** Chemin KV v2 (relatif au mount `kv/data/`) du couple de clés Ed25519. */
  VAULT_AUDIT_KEY_PATH: z.string().default('audit/signing-key'),
  /** Active le scellement horaire de la racine (désactivable en test). */
  AUDIT_SEAL_ENABLED: z.coerce.boolean().default(true),

  // ── Throttle (endpoints de preuve coûteux) ────────────────────────────
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(60),
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
    throw new Error(`[audit-service] Configuration invalide :\n${lines}`);
  }
  return parsed.data;
}
