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

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z.string().default('document-service:'),

  RABBITMQ_URL: z.string().default('amqp://nina:nina@localhost:5672'),
  RABBITMQ_AUDIT_EXCHANGE: z.string().default('audit.events'),
  RABBITMQ_NOTIF_EXCHANGE: z.string().default('notification.events'),

  // Vault Transit pour signer le QR
  VAULT_ADDR: z.string().url().default('http://localhost:8200'),
  VAULT_TOKEN: z.string().min(1).default('dev-only-root-token'),
  VAULT_QR_SIGNING_KEY: z.string().default('nina-qr-signing'),

  // MinIO
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_ACCESS_KEY: z.string().default('minio'),
  MINIO_SECRET_KEY: z.string().default('minio12345'),
  MINIO_BUCKET_FICHES: z.string().default('fiches'),
  MINIO_RETENTION_YEARS: z.coerce.number().int().positive().default(10),

  // identity-service (HTTP en P0 — gRPC reporté Bloc B)
  IDENTITY_SERVICE_URL: z.string().url().default('http://localhost:3001'),

  // JWKS QR publique (consommée par les mobiles et /verify-qr)
  JWKS_QR_URL: z.string().url().default('http://localhost:3002/.well-known/jwks-qr.json'),

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
