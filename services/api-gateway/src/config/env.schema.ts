/**
 * @file        env.schema.ts
 * @description Schéma Zod des variables d'environnement de l'api-gateway.
 *              Validation **fail-fast** au démarrage : si une variable est
 *              invalide/absente, le process refuse de booter plutôt que de se
 *              comporter de façon imprévisible en production.
 *
 *              ⚠️  Secrets : `GATEWAY_HS256_SECRET` signe le header interne
 *              `X-User-Context` (JWS HS256) propagé aux services aval. En
 *              développement, un défaut est fourni ; en production il DOIT
 *              provenir de Vault (cf. doc 15 Security Hardening) — un garde-fou
 *              ci-dessous refuse le défaut si `NODE_ENV=production`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/config
 */
import { z } from 'zod';

/** Secret HS256 par défaut — TOLÉRÉ en dev/test uniquement (voir refine plus bas). */
const DEV_HS256_SECRET = 'dev-gateway-hs256-secret-change-in-prod-min-32-chars';

/**
 * Parseur booléen tolérant : `z.coerce.boolean()` renvoie `true` pour toute
 * chaîne non vide (y compris `"false"`). On normalise explicitement.
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

/** Schéma typé de l'environnement api-gateway. */
export const envSchema = z
  .looseObject({
    // ── Réseau / runtime ────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
    SERVICE_VERSION: z.string().default('1.0.0'),
    GIT_SHA: z.string().optional(),
    /** Origines CORS autorisées (CSV). En prod : jamais de wildcard. */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:4001,http://localhost:4002,http://localhost:4003'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    LOKI_URL: z.url().optional(),

    // ── Observabilité ────────────────────────────────────────────────────
    /** Active le SDK OTel (traces). Désactivable en CI / dev léger. */
    OTEL_TRACING_ENABLED: zBool(false),

    // ── Authentification (JWT RS256 vérifié via JWKS d'auth-service) ─────
    AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),
    /** Si false, n'exige pas de JWT (UNIQUEMENT pour bancs de test isolés). */
    AUTH_REQUIRED: zBool(true),

    // ── Propagation du contexte utilisateur signé (X-User-Context, HS256) ─
    GATEWAY_HS256_SECRET: z.string().min(32).default(DEV_HS256_SECRET),
    /** Durée de vie (s) du JWS interne — court pour limiter le rejeu. */
    GATEWAY_USER_CONTEXT_TTL_SEC: z.coerce.number().int().positive().default(60),

    // ── Redis (rate limiting distribué) ──────────────────────────────────
    REDIS_URL: z.url().default('redis://localhost:6379'),
    /** Préfixe de toutes les clés Redis (cloisonnement multi-service). */
    REDIS_KEY_PREFIX: z.string().default('gateway:'),

    // ── Rate limiting (global + par utilisateur, Redis-backed) ───────────
    RATE_LIMIT_ENABLED: zBool(true),
    /** Largeur de la fenêtre glissante (s). */
    RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),
    /** Nombre de requêtes autorisées par fenêtre et par identité (user|IP). */
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

    // ── Swagger agrégé ───────────────────────────────────────────────────
    /** TTL (s) du cache de la spec OpenAPI agrégée. */
    SWAGGER_AGGREGATE_TTL_SEC: z.coerce.number().int().positive().default(300),
    /** Timeout (ms) du fetch de chaque spec aval lors de l'agrégation. */
    SWAGGER_AGGREGATE_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
    /** Si true, construit la spec agrégée AU BOOT et la sert sur /api/docs. */
    SWAGGER_AGGREGATE_ON_BOOT: zBool(false),

    // ── URLs des 14 services aval (défaut = noms d'hôtes Docker Compose) ──
    IDENTITY_SERVICE_URL: z.url().default('http://identity-service:3001'),
    AUTH_SERVICE_URL: z.url().default('http://auth-service:3002'),
    AI_SERVICE_URL: z.url().default('http://ai-service:3003'),
    DOCUMENT_SERVICE_URL: z.url().default('http://document-service:3004'),
    NOTIFICATION_SERVICE_URL: z.url().default('http://notification-service:3005'),
    INTEROP_SERVICE_URL: z.url().default('http://interop-service:3006'),
    AUDIT_SERVICE_URL: z.url().default('http://audit-service:3007'),
    APPOINTMENT_SERVICE_URL: z.url().default('http://appointment-service:3008'),
    ANTICORRUPTION_SERVICE_URL: z.url().default('http://anticorruption-service:3009'),
    GOVERNANCE_SERVICE_URL: z.url().default('http://governance-service:3010'),
    VULNERABILITY_SERVICE_URL: z.url().default('http://vulnerability-service:3011'),
    BIOMETRIC_SERVICE_URL: z.url().default('http://biometric-service:3012'),
    ENROLLMENT_SERVICE_URL: z.url().default('http://enrollment-service:3013'),
    USSD_SERVICE_URL: z.url().default('http://ussd-service:3014'),
  })
  // Garde-fou souveraineté/sécurité : interdit le secret de dev en production.
  .refine(
    (env) => !(env.NODE_ENV === 'production' && env.GATEWAY_HS256_SECRET === DEV_HS256_SECRET),
    {
      message:
        'GATEWAY_HS256_SECRET doit être fourni par Vault en production (le défaut de dev est interdit).',
      path: ['GATEWAY_HS256_SECRET'],
    },
  );

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
    throw new Error(`[api-gateway] Configuration invalide :\n${lines}`);
  }
  return parsed.data;
}
