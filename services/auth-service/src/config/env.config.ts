/**
 * @file        env.config.ts
 * @description Schéma Zod v4 pour valider toutes les variables d'environnement
 *              du auth-service au démarrage. Toute variable manquante/invalide
 *              déclenche une erreur fatale avant que Nest ne démarre — pas de
 *              défauts implicites côté code applicatif.
 *
 *              Utilisé par {@link ConfigModule.forRoot} via `validate:`.
 *
 * @module      auth-service/config
 */

import { z } from 'zod';

/** Schéma typé de toutes les variables d'environnement consommées par le service. */
export const EnvSchema = z.object({
  // ─── Application ────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  SERVICE_NAME: z.string().default('auth-service'),
  SERVICE_VERSION: z.string().default('0.1.0'),
  ENV: z.string().default('dev'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(3002),
  CORS_ORIGINS: z.string().default(''),

  // ─── PostgreSQL ─────────────────────────────────────────────────
  DATABASE_URL: z.url(),

  // ─── Redis ──────────────────────────────────────────────────────
  REDIS_URL: z
    .string()
    .regex(/^rediss?:\/\//, 'REDIS_URL doit commencer par redis:// ou rediss://'),
  REDIS_KEY_PREFIX: z.string().default('auth:'),

  // ─── Keycloak ───────────────────────────────────────────────────
  KEYCLOAK_URL: z.url(),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  KEYCLOAK_ADMIN: z.string().min(1),
  KEYCLOAK_ADMIN_PASSWORD: z.string().min(1),
  /**
   * Émetteur (`iss`) attendu dans le token Keycloak présenté à
   * `POST /auth/sso/exchange` — c'est l'issuer VU PAR LE NAVIGATEUR
   * (ex. `http://localhost:8080/realms/nina-aes`). En déploiement
   * « split-horizon » il peut différer de `KEYCLOAK_URL` (URL interne
   * atteignable par le service pour récupérer le JWKS). Absent ⇒ dérivé de
   * `KEYCLOAK_URL`/`KEYCLOAK_REALM` (cas mono-hôte du dev). @see ADR-036
   */
  KEYCLOAK_ISSUER: z.url().optional(),
  /**
   * Client Keycloak dont les tokens sont acceptés par l'échange SSO citoyen
   * (claim `azp`). Scope l'endpoint au portail citoyen : un token émis pour un
   * autre client est rejeté. @see ADR-036
   */
  KEYCLOAK_SSO_CLIENT_ID: z.string().min(1).default('nina-citizen'),

  // ─── JWT (clés via Vault, métadonnées ici) ──────────────────────
  VAULT_JWT_KEYS_PATH: z.string().min(1).default('auth/jwt'),
  /**
   * Émetteur (`iss`) gravé dans tous les tokens applicatifs NINA.
   * ⚠️ CONTRAT INTER-SERVICE : doit valoir EXACTEMENT la valeur attendue par
   * les vérificateurs JWKS aval (`AUTH_JWT_ISSUER`, défaut `nina-aes-auth`,
   * cf. `identity-service/src/auth/jwks-jwt.verifier.ts`). Ce n'est donc PAS
   * une URL — un `z.url()` ici casserait le flux citoyen au premier guard.
   */
  JWT_ISSUER: z.string().min(1).default('nina-aes-auth'),
  /**
   * Audience(s) (`aud`) — LISTE séparée par des virgules. Chaque vérificateur
   * aval exige que l'`aud` du token CONTIENNE son identité propre
   * (`nina-identity-service`, etc.). On émet donc l'union des services NINA
   * cibles afin qu'un même access token soit accepté par tous les avals
   * légitimes. Parsé en `string[]` par {@link parseAudience}.
   */
  JWT_AUDIENCE: z
    .string()
    .min(1)
    .default(
      'nina-identity-service,nina-appointment-service,nina-audit-service,nina-document-service,nina-notification-service,nina-api-gateway',
    ),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
  JWT_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // ─── Vault ──────────────────────────────────────────────────────
  VAULT_ADDR: z.url(),
  VAULT_AUTH_METHOD: z.enum(['token', 'approle', 'kubernetes']).default('token'),
  VAULT_TOKEN: z.string().optional(),
  VAULT_APPROLE_ROLE_ID: z.string().optional(),
  VAULT_APPROLE_SECRET_ID: z.string().optional(),
  VAULT_KUBERNETES_ROLE: z.string().optional(),
  /** Nom de la clé Transit utilisée pour chiffrer les secrets MFA TOTP au repos. */
  VAULT_TRANSIT_MFA_KEY: z.string().min(1).default('auth-mfa-secret'),

  // ─── Argon2id (OWASP) ───────────────────────────────────────────
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).default(19_456),
  ARGON2_ITERATIONS: z.coerce.number().int().min(2).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),

  // ─── MFA TOTP ───────────────────────────────────────────────────
  MFA_TOTP_ISSUER: z.string().default('NINA-AES'),
  MFA_TOTP_WINDOW: z.coerce.number().int().min(0).max(2).default(1),

  // ─── SMS (Africa's Talking) ─────────────────────────────────────
  MOCK_SMS: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
  AT_USERNAME: z.string().default('sandbox'),
  AT_API_KEY: z.string().default(''),
  AT_SENDER_ID: z.string().default('NINAAES'),

  // ─── Throttle login ─────────────────────────────────────────────
  THROTTLE_LOGIN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  THROTTLE_LOGIN_LIMIT: z.coerce.number().int().positive().default(5),
  /** Rate-limit `POST /auth/sso/exchange` : fenêtre (s) + plafond par IP (ADR-036). */
  THROTTLE_SSO_EXCHANGE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_SSO_EXCHANGE_LIMIT: z.coerce.number().int().positive().default(10),

  // ─── Observabilité ──────────────────────────────────────────────
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  LOKI_URL: z.url().optional(),
  PROMETHEUS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
});

/** Type effectif après validation (`z.infer`). */
export type AppEnv = z.infer<typeof EnvSchema>;

/**
 * Normalise `JWT_AUDIENCE` (chaîne CSV) en `string[]` non vide, en
 * supprimant espaces et entrées vides. Centralisé ici pour garantir le même
 * découpage côté émission (JwtCryptoService) que côté documentation.
 *
 * @param raw Valeur brute de `JWT_AUDIENCE` (ex. `"a, b ,c"`).
 * @returns Liste d'audiences (au moins un élément si `raw` non vide).
 */
export function parseAudience(raw: string): string[] {
  return raw
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

/**
 * Callback `validate` à passer à `ConfigModule.forRoot({ validate })`.
 * Convertit les `ZodError` en messages lisibles pour faciliter l'ops.
 *
 * @throws Error agrégée listant toutes les variables invalides.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'} : ${i.message}`)
      .join('\n');
    throw new Error(`[auth-service] Configuration invalide :\n${lines}`);
  }
  return result.data;
}
