/**
 * @file        env.schema.ts
 * @description Schéma Zod validant les variables d'environnement du service.
 *              Exécuté au boot (NestJS ConfigModule). Échec = process exit.
 * @module      document-service/config
 */
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3004),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:4001'),

  DATABASE_URL: z.url(),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default('document-service:'),

  RABBITMQ_URL: z.string().default('amqp://nina:nina@localhost:5672'),
  // Exchange topic CANONIQUE du bus d'événements (cf. infrastructure/.../definitions.json et
  // audit-service). Les routing keys `document.*` y sont captées par audit-service (pattern
  // `document.#`). Anciennement `audit.events` — exchange orphelin non consommé (drift corrigé).
  RABBITMQ_EVENTS_EXCHANGE: z.string().default('nina.events'),
  RABBITMQ_NOTIF_EXCHANGE: z.string().default('notification.events'),

  // ── Vault (Transit pour signer le QR + KV pour les secrets) ────────────
  // 🔒 DURCISSEMENT P1 — JAMAIS de VAULT_TOKEN long-lived par défaut (cf. CANON
  // sécurité / MEMORY) : on privilégie AppRole (TTL court, auto-renew). Le mode
  // `token` reste autorisé pour le dev local (Vault dev `vault server -dev`),
  // mais SANS valeur par défaut codée en dur — un secret ne doit jamais être
  // « baked-in » dans le schéma. ⏳ Migration complète des secrets applicatifs
  // (DATABASE_URL/REDIS_URL/RABBITMQ_URL/MINIO_*) vers Vault KV v2 = Phase 2
  // (cf. doc 10 §9.3 / §9.3bis SecretsLoader).
  VAULT_ADDR: z.url().default('http://localhost:8200'),
  VAULT_AUTH_METHOD: z.enum(['token', 'approle', 'kubernetes']).default('token'),
  VAULT_TOKEN: z.string().optional(),
  VAULT_APPROLE_ROLE_ID: z.string().optional(),
  VAULT_APPROLE_SECRET_ID: z.string().optional(),
  VAULT_KUBERNETES_ROLE: z.string().optional(),
  VAULT_QR_SIGNING_KEY: z.string().default('nina-qr-signing'),

  // MinIO
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  // 🔒 DURCISSEMENT P1 — secrets OBLIGATOIRES, JAMAIS de valeur par défaut
  // codée en dur (même règle que DATABASE_URL / VAULT_TOKEN ; cf. CANON
  // sécurité / MEMORY). Anciennement « minio » / « minio12345 » baked-in →
  // credentials S3 exfiltrables depuis le code. Sourcés depuis l'environnement
  // (dev : `.env` local non versionné ; prod : Vault KV v2, doc 10 §9.3bis).
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET_FICHES: z.string().default('fiches'),
  MINIO_RETENTION_YEARS: z.coerce.number().int().positive().default(10),

  // identity-service (HTTP en P0 — gRPC reporté Bloc B)
  IDENTITY_SERVICE_URL: z.url().default('http://localhost:3001'),

  // JWKS QR publique (consommée par les mobiles et /verify-qr)
  JWKS_QR_URL: z.url().default('http://localhost:3002/.well-known/jwks-qr.json'),

  // JWKS auth-service (utilisée par JwtAuthGuard pour valider les access tokens)
  AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),
  // Contrat inter-service du token RS256 (cf. auth-service JWT_ISSUER / JWT_AUDIENCE).
  // `iss` attendu (souverain auth-service) et `aud` propre à CE service — vérifiés
  // INCONDITIONNELLEMENT par JwksJwtVerifier (anti-token étranger / anti-réutilisation).
  AUTH_JWT_ISSUER: z.string().min(1).default('nina-aes-auth'),
  AUTH_JWT_AUDIENCE: z.string().min(1).default('nina-document-service'),

  // FDI
  FDI_TTL_DAYS: z.coerce.number().int().positive().default(180),
  FDI_PUPPETEER_POOL_SIZE: z.coerce.number().int().positive().default(4),
  FDI_PDF_CACHE_TTL_SEC: z.coerce.number().int().nonnegative().default(300),

  // Rate-limiting endpoint public
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Helper pour ConfigModule.forRoot({ validate }).
 * Logue un résumé compact + lève une erreur explicite si invalide.
 */
export function validateEnv(input: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide:\n${issues}`);
  }
  return parsed.data;
}
