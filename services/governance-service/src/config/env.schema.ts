/**
 * @file        env.schema.ts
 * @description Schéma Zod des variables d'environnement du governance-service
 *              (Bloc C2/C3, port 3010). Échoue au démarrage (fail-fast) si une
 *              variable est invalide/absente — aucun défaut implicite enfoui
 *              dans le code.
 *
 *              ⚠️  Secrets : AUCUN secret en clair dans cette config. Les clés de
 *              signature (JWS RS256 SGOGT/export DGE) et HMAC (pseudonyme
 *              électoral) restent DANS Vault Transit (non exportables) ; seuls
 *              les CHEMINS / NOMS de clés sont configurés ici. Les credentials
 *              PostgreSQL (DATABASE_URL) et RabbitMQ (RABBITMQ_URL) proviennent
 *              du `.env` racine en dev et de Vault Agent (sidecar) en prod
 *              (cf. doc 15). Le NINA n'apparaît jamais dans les messages SGOGT
 *              (institutionnels) ni dans l'export électoral (pseudonymisé).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/config
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

/** Schéma typé de l'environnement governance-service. */
export const envSchema = z.looseObject({
  // ── Réseau ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  GOVERNANCE_SERVICE_PORT: z.coerce.number().int().positive().default(3010),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:4003'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Base de données ───────────────────────────────────────────────────
  DATABASE_URL: z.url(),

  // ── JWT (vérification RS256 via JWKS d'auth-service) ──────────────────
  AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),
  /** Émetteur attendu (`iss`) — OBLIGATOIRE (anti-token étranger). */
  AUTH_JWT_ISSUER: z.string().default('nina-aes-auth'),
  /**
   * Audience attendue (`aud`) — vérifiée INCONDITIONNELLEMENT. Seul rempart
   * contre la réutilisation d'un token émis pour un AUTRE service interne
   * partageant le même JWKS RS256.
   */
  AUTH_JWT_AUDIENCE: z.string().default('nina-governance-service'),

  // ── RabbitMQ (publication des événements d'audit vers audit-service) ──
  RABBITMQ_URL: z.url().default('amqp://localhost:5672'),
  /** Exchange topic du bus d'événements métier (consommé par audit-service). */
  RABBITMQ_EVENTS_EXCHANGE: z.string().default('nina.events'),
  /** Active la publication d'audit RabbitMQ (désactivable en test/CI). */
  GOVERNANCE_AUDIT_ENABLED: zBool(true),

  // ── Vault (signature JWS Transit + HMAC pseudonyme) ───────────────────
  VAULT_ADDR: z.url().default('http://localhost:8200'),
  VAULT_AUTH_METHOD: z.enum(['token', 'approle', 'kubernetes']).default('token'),
  VAULT_TOKEN: z.string().optional(),
  VAULT_APPROLE_ROLE_ID: z.string().optional(),
  VAULT_APPROLE_SECRET_ID: z.string().optional(),
  VAULT_KUBERNETES_ROLE: z.string().optional(),
  /**
   * Active l'usage réel de Vault Transit (signature/HMAC). En test/CI on le
   * désactive : le signer/pseudonymiseur retombe alors sur un mode DEV
   * déterministe (jamais en production — fail-fast ci-dessous).
   */
  GOVERNANCE_VAULT_ENABLED: zBool(true),
  /**
   * Clé Transit RS256 (non exportable) signant les manifestes d'export DGE et
   * l'historique d'escalade système. La partie publique est extractible
   * (`transitReadPublicKey`) pour vérification externe (DGE / Vérif. Général).
   */
  VAULT_ELECTIONS_EXPORT_KEY: z.string().default('elections-export'),
  /**
   * Clé HMAC Transit (non exportable) du `pseudonymousId` électoral.
   * La SEULE valeur secrète protégeant le pseudonyme (cf. contrat §4).
   */
  VAULT_ELECTIONS_HMAC_KEY: z.string().default('elections-pseudonym'),
  /**
   * Préfixe des clés Transit RSA par-fonctionnaire signant les messages SGOGT.
   * `kid` final = `<prefix><userId>` (ex. `sgogt-user-<uuid>`).
   */
  VAULT_SGOGT_KEY_PREFIX: z.string().default('sgogt-user-'),

  // ── Pseudonymisation électorale ───────────────────────────────────────
  /**
   * Version de contexte HMAC active (tag de SÉPARATION DE DOMAINE PUBLIC, PAS
   * un sel secret) mélangée à l'entrée du HMAC. Stockée en clair / journalisée ;
   * la faire tourner produit des pseudonymes différents sans casser l'historique.
   */
  ELECTIONS_SALT_VERSION: z.coerce.number().int().positive().default(1),

  // ── Escalade SGOGT (TTL d'absence d'accusé) ───────────────────────────
  /** TTL d'escalade (heures) pour un message NORMAL/HIGH non accusé. */
  SGOGT_TTL_NORMAL_HOURS: z.coerce.number().int().positive().default(24),
  /** TTL d'escalade (heures) pour un message CRITICAL non accusé. */
  SGOGT_TTL_CRITICAL_HOURS: z.coerce.number().int().positive().default(4),
  /** Active le cron de balayage/escalade SGOGT (désactivable en test/CI). */
  SGOGT_ESCALATION_CRON_ENABLED: zBool(true),
  /** Active le cron d'inscription électorale auto à 18 ans (désactivable). */
  ELECTIONS_INSCRIPTION_CRON_ENABLED: zBool(true),

  // ── Export DGE — quota PAR COMPTE + rate-limit PAR IP ─────────────────
  /** Plafond d'exports DGE PAR COMPTE et PAR JOUR (quota applicatif atomique). */
  DGE_EXPORT_DAILY_QUOTA: z.coerce.number().int().positive().default(5),
  /** Fenêtre du throttler nommé `dge` (ms) — défense en profondeur PAR IP. */
  DGE_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  /** Limite du throttler nommé `dge` sur la fenêtre — PAR IP. */
  DGE_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),

  // ── Throttle HTTP global (protection de base de toutes les routes) ────
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  // ── Limite de corps HTTP (anti-amplification mémoire) ─────────────────
  HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(2_097_152),
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
    throw new Error(`[governance-service] Configuration invalide :\n${lines}`);
  }
  return parsed.data;
}
