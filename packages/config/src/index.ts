/**
 * @file        index.ts
 * @description Configuration centrale de la plateforme NINA-AES.
 *
 *              Fournit :
 *                - Un schéma Zod exhaustif des variables d'environnement
 *                  requises par les 11 microservices, les frontaux et
 *                  l'infrastructure.
 *                - Un chargement automatique du fichier `.env` situé à la
 *                  racine du monorepo (si présent).
 *                - Un singleton `config` (validation paresseuse, une seule fois).
 *                - Des constantes partagées (CORS, ports, limites de débit).
 *
 *              En cas de variable manquante ou invalide, l'erreur listée
 *              explicitement les champs fautifs et interrompt le démarrage.
 *
 * @author      Étudiant UQAR
 * @date        Avril 2026
 * @module      @nina-aes/config
 */

import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { expand as dotenvExpand } from 'dotenv-expand';
import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
//  Chargement automatique du fichier .env (racine du monorepo)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Localise le fichier `.env` en remontant depuis `process.cwd()` jusqu'à trouver
 * un dossier contenant `pnpm-workspace.yaml` (marqueur de la racine du monorepo).
 * Évite d'avoir à lancer chaque service depuis la racine du projet.
 *
 * @returns Chemin absolu vers `.env` si trouvé, sinon `null`.
 */
function locateMonorepoEnv(): string | null {
  let dir = process.cwd();
  const { root } = path.parse(dir);
  for (let i = 0; i < 8; i++) {
    const envPath = path.join(dir, '.env');
    const wsPath = path.join(dir, 'pnpm-workspace.yaml');
    if (fs.existsSync(envPath) && fs.existsSync(wsPath)) return envPath;
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

// Charge le `.env` racine s'il existe — sinon on se contente de `process.env`.
// On désactive ce chargement quand `NINA_SKIP_DOTENV=1` (tests unitaires
// ou environnements containerisés où l'orchestrateur fournit déjà les vars).
const ENV_PATH = locateMonorepoEnv();
if (ENV_PATH && process.env.NINA_SKIP_DOTENV !== '1') {
  const parsed = dotenv.config({ path: ENV_PATH, override: false });
  // Permet l'interpolation `${VAR}` dans le .env (alignée sur docker-compose).
  dotenvExpand(parsed);
}

// ──────────────────────────────────────────────────────────────────────────────
//  Schéma Zod des variables d'environnement
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Expression régulière d'une durée acceptée pour les expirations JWT :
 *   - format ISO simplifié : `15m`, `7d`, `3600s`, `500ms`
 *   - ou nombre brut de secondes : `86400`, `900`, …
 *
 * Les deux formes sont acceptées pour rester compatibles avec les conventions
 * existantes (NestJS attend un duration string, Keycloak/Vault attendent des
 * secondes).
 */
const DURATION_REGEX = /^(\d+(ms|s|m|h|d)|\d+)$/;

/**
 * Schéma exhaustif des variables d'environnement de la plateforme NINA-AES.
 *
 * Les valeurs par défaut sont adaptées à un poste de développement Windows
 * (docker-compose local). En production, toutes les variables sensibles
 * (JWT_SECRET, VAULT_TOKEN, *_CERT_PATH…) doivent être fournies explicitement.
 */
export const envSchema = z.object({
  // ── Environnement ─────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),

  // ── Bases de données & infrastructures ─────────────────────────────────
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://nina_admin:nina_dev_2026!@localhost:5432/nina_aes_db?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  RABBITMQ_URL: z.string().default('amqp://nina_rabbit:rabbit_dev_2026!@localhost:5672'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),

  // ── Stockage objet MinIO ──────────────────────────────────────────────
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_ACCESS_KEY: z.string().min(3).default('nina_minio_key'),
  MINIO_SECRET_KEY: z.string().min(8).default('nina_minio_secret'),
  MINIO_BUCKET: z.string().default('nina-documents'),
  MINIO_REGION: z.string().default('us-east-1'),

  // ── JWT & clés asymétriques ───────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET doit contenir au moins 32 caractères')
    .default('dev-jwt-secret-change-this-in-production-32chars!'),
  JWT_PRIVATE_KEY_PATH: z.string().default('./secrets/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./secrets/jwt-public.pem'),
  JWT_ACCESS_EXPIRATION: z
    .string()
    .regex(DURATION_REGEX, 'Format attendu : "15m", "1h", "7d"…')
    .default('15m'),
  JWT_REFRESH_EXPIRATION: z
    .string()
    .regex(DURATION_REGEX, 'Format attendu : "15m", "1h", "7d"…')
    .default('7d'),

  // ── Journalisation & ports ────────────────────────────────────────────
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  API_GATEWAY_PORT: z.coerce.number().int().positive().default(3000),

  // ── HashiCorp Vault ───────────────────────────────────────────────────
  VAULT_ADDR: z.string().url().default('http://localhost:8200'),
  VAULT_TOKEN: z.string().default('dev-root-token'),
  VAULT_NAMESPACE: z.string().default('nina-aes'),

  // ── APIs externes : Africa's Talking (USSD / SMS) ─────────────────────
  AFRICAS_TALKING_API_KEY: z.string().default('sandbox-api-key'),
  AFRICAS_TALKING_USERNAME: z.string().default('sandbox'),

  // ── Authenticité du webhook USSD Africa's Talking (P0 sécurité, doc 14 §4.2) ──
  // Ces deux variables durcissent le webhook PUBLIC `POST /ussd/callback`.
  // Défauts SÛRS : chaîne vide pour NE PAS casser le boot des autres services
  // (le webhook n'existe que dans ussd-service). Le fail-closed réel est
  // appliqué DANS `AtAuthenticityGuard` quand `NODE_ENV=production` :
  //   - allowlist vide en prod  → tout appel rejeté (403) ;
  //   - secret vide en prod     → tout appel rejeté (403).
  // En dev (`NODE_ENV != production`), un défaut vide reste permissif pour
  // permettre le simulateur local sans config supplémentaire.
  //
  /** CSV des IP sortantes autorisées des passerelles Africa's Talking / opérateur. */
  AT_GATEWAY_IP_ALLOWLIST: z.string().default(''),
  /**
   * Secret partagé attendu dans l'en-tête `X-AT-Webhook-Secret` (comparé en
   * TEMPS CONSTANT). Optionnel au boot (.default('')) ; REQUIS en production
   * (fail-closed dans le guard). Vit dans Vault — jamais en clair dans le code.
   */
  AT_WEBHOOK_SHARED_SECRET: z.string().default(''),
  /**
   * Nombre de sauts (hops) de reverse-proxy DE CONFIANCE devant ussd-service
   * (Express `trust proxy`). Tant que l'IP source est une frontière de sécurité
   * (IP allowlist du webhook USSD), l'en-tête `X-Real-IP` / `X-Forwarded-For`
   * ne doit être honoré QUE s'il provient d'un proxy de confiance — sinon un
   * client Internet pourrait usurper `X-Real-IP: <IP-AT-allowlistée>` et
   * contourner la couche 1. Mettre le nombre EXACT de proxys que la requête
   * traverse (ex. `1` = un seul NGINX/ingress en amont). `0` = aucun proxy de
   * confiance : on n'honore AUCUN en-tête transféré (on n'utilise que l'IP du
   * pair TCP direct). En production, ce guard impose une valeur ≥ 1.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // ── Certificats mTLS pour l'interopérabilité AES ──────────────────────
  AES_MLI_CERT_PATH: z.string().default('./secrets/aes/mli.pem'),
  AES_BFA_CERT_PATH: z.string().default('./secrets/aes/bfa.pem'),
  AES_NER_CERT_PATH: z.string().default('./secrets/aes/ner.pem'),
  AES_CA_PATH: z.string().default('./secrets/aes/ca.pem'),

  // ── interop-service BCID-AES (Bloc B, port 3006, doc 21 / ADR-021) ─────
  // Défauts SÛRS : ne cassent le boot d'aucun autre service. Le détail (fenêtre
  // anti-replay, quota, simulation dev) vit dans `services/interop-service/src/
  // config/env.schema.ts` ; ces clés sont déclarées ici pour la cohérence du
  // schéma racine + turbo.json globalEnv.
  /** Pays opéré par le nœud interop local (ISO 3166-1 alpha-3). */
  INTEROP_SELF_COUNTRY: z.enum(['MLI', 'BFA', 'NER']).default('MLI'),
  /** `iss` placé par ce nœud dans les JWS signés. */
  INTEROP_SELF_ISSUER: z.string().url().default('https://interop.nina-aes.ml'),
  /** Quota de requêtes entrantes par pays (rate-limit contractuel). */
  INTEROP_RATE_LIMIT_PER_COUNTRY: z.coerce.number().int().positive().default(1000),
  /** Largeur de la fenêtre glissante du rate-limit (secondes). */
  INTEROP_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(3600),
  /**
   * Faire confiance aux en-têtes mTLS réécrits par l'ingress (`ssl-client-*`).
   * `true` par défaut ; en dev local sans ingress, mettre `false` + INTEROP_DEV_PEER_*.
   */
  INTEROP_TRUST_INGRESS_HEADERS: z.coerce.boolean().default(true),
  /** Chemin Vault KV (relatif au mount kv/data/) de la clé Ed25519 de signature. */
  VAULT_INTEROP_KEY_PATH: z.string().default('interop/signing-key'),
  /** Endpoints des passerelles partenaires, CSV `PAYS=URL`. Vide par défaut. */
  INTEROP_PARTNER_ENDPOINTS: z.string().default(''),

  // ── governance-service SGOGT + électoral (Bloc C2/C3, port 3010) ──────
  // Défauts SÛRS : ne cassent le boot d'aucun autre service. Le détail (TTL
  // d'escalade, quota DGE, fail-fast Vault) vit dans `services/governance-
  // service/src/config/env.schema.ts` ; ces clés sont déclarées ici pour la
  // cohérence du schéma racine + turbo.json globalEnv. AUCUN secret : seuls des
  // NOMS de clés Vault Transit (clés non exportables, jamais lues côté service).
  /** Active la publication d'audit RabbitMQ du governance-service. */
  GOVERNANCE_AUDIT_ENABLED: z.coerce.boolean().default(true),
  /** Active l'usage réel de Vault Transit (signature JWS / HMAC pseudonyme). */
  GOVERNANCE_VAULT_ENABLED: z.coerce.boolean().default(true),
  /** Clé Transit RS256 (non exportable) signant l'export DGE + l'escalade système. */
  VAULT_ELECTIONS_EXPORT_KEY: z.string().default('elections-export'),
  /** Clé HMAC Transit (non exportable) du pseudonyme électoral. */
  VAULT_ELECTIONS_HMAC_KEY: z.string().default('elections-pseudonym'),
  /** Préfixe des clés Transit RSA par-fonctionnaire signant les messages SGOGT. */
  VAULT_SGOGT_KEY_PREFIX: z.string().default('sgogt-user-'),
  /** Version de contexte HMAC (tag de séparation de domaine PUBLIC, pas un secret). */
  ELECTIONS_SALT_VERSION: z.coerce.number().int().positive().default(1),
  /** TTL d'escalade (heures) pour un message SGOGT NORMAL/HIGH non accusé. */
  SGOGT_TTL_NORMAL_HOURS: z.coerce.number().int().positive().default(24),
  /** TTL d'escalade (heures) pour un message SGOGT CRITICAL non accusé. */
  SGOGT_TTL_CRITICAL_HOURS: z.coerce.number().int().positive().default(4),
  /** Active le cron de balayage/escalade SGOGT. */
  SGOGT_ESCALATION_CRON_ENABLED: z.coerce.boolean().default(true),
  /** Active le cron d'inscription électorale auto à 18 ans. */
  ELECTIONS_INSCRIPTION_CRON_ENABLED: z.coerce.boolean().default(true),
  /** Plafond d'exports DGE PAR COMPTE et PAR JOUR (quota applicatif atomique). */
  DGE_EXPORT_DAILY_QUOTA: z.coerce.number().int().positive().default(5),
  /** Fenêtre du throttler nommé `dge` (ms) — défense en profondeur PAR IP. */
  DGE_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  /** Limite du throttler nommé `dge` sur la fenêtre — PAR IP. */
  DGE_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),

  // ── biometric-service (Bloc F, port 3012 — le module le plus sensible) ─
  // Défauts SÛRS : ne cassent le boot d'aucun autre service. Le détail (seuil τ,
  // dimension de projection, gate DPIA, anti-bruteforce) vit dans `services/
  // biometric-service/src/config/env.schema.ts` ; ces clés sont déclarées ici
  // pour la cohérence du schéma racine + turbo.json globalEnv. AUCUN secret : le
  // paramètre cancelable vit dans Vault (jamais en base, jamais en clair ici).
  /** Active la publication d'audit RabbitMQ du biometric-service. */
  BIOMETRIC_AUDIT_ENABLED: z.coerce.boolean().default(true),
  /** Active l'accès Vault au paramètre cancelable (désactivable en test/CI). */
  BIOMETRIC_VAULT_ENABLED: z.coerce.boolean().default(true),
  /** Chemin Vault du SECRET de transformation cancelable (« sel » de projection). */
  BIOMETRIC_TRANSFORM_SECRET_PATH: z.string().default('kv/data/biometric/bio-transform'),
  /** `transform_kid` ACTIF pour les nouveaux enrôlements (versionné, rotation). */
  BIOMETRIC_ACTIVE_TRANSFORM_KID: z.string().default('bio-transform-v1'),
  /** Dimension de la projection aléatoire (longueur du code signe binarisé). */
  BIOMETRIC_PROJECTION_DIM: z.coerce.number().int().positive().default(512),
  /** Seuil τ par défaut (distance de Hamming normalisée) — à mesurer en P3a (DET). */
  BIOMETRIC_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.32),
  /** Métrique de comparaison figée à l'enrôlement (traçabilité du point DET). */
  BIOMETRIC_MATCH_METRIC: z.string().default('hamming-normalized'),
  /** Audience attendue dans le JWS de consentement (`aud`, anti-relais). */
  BIOMETRIC_CONSENT_AUDIENCE: z.string().default('nina-biometric-service'),
  /** Tolérance d'horloge (s) des bornes nbf/exp du consentement (capture offline). */
  BIOMETRIC_CONSENT_CLOCK_TOLERANCE_SEC: z.coerce.number().int().min(0).default(60),
  /** Échecs max de vérification par (agent, citoyen) avant verrouillage (anti-bruteforce). */
  BIOMETRIC_VERIFY_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  /** Fenêtre (s) de comptage des échecs + durée du verrouillage anti-bruteforce. */
  BIOMETRIC_VERIFY_LOCKOUT_SEC: z.coerce.number().int().positive().default(900),
  /**
   * GATE BLOQUANT : DPIA biométrie signée par le CISO/DPO CTDEC ? Défaut SÛR
   * `false` (le module ne se déploie pas en prod sans signature — DPIA §10). Le
   * fail-fast réel est appliqué DANS `DpiaGateService` quand `NODE_ENV=production`.
   */
  BIOMETRIC_DPIA_SIGNED: z.coerce.boolean().default(false),

  // ── Observabilité ─────────────────────────────────────────────────────
  PROMETHEUS_PORT: z.coerce.number().int().positive().default(9090),
  JAEGER_ENDPOINT: z.string().url().default('http://localhost:14268/api/traces'),
});

/** Type inféré du schéma complet (à consommer par les microservices). */
export type Env = z.infer<typeof envSchema>;

// Rétro-compatibilité : alias historique pour les services qui importaient
// déjà `BaseEnv` / `baseEnvSchema` depuis ce module.
export const baseEnvSchema = envSchema;
export type BaseEnv = Env;

// ──────────────────────────────────────────────────────────────────────────────
//  Validation paresseuse + singleton
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Valide un ensemble de variables d'environnement avec un schéma Zod arbitraire.
 * Utile pour les microservices qui étendent {@link envSchema} avec leurs
 * propres variables (ex. `KEYCLOAK_REALM`, `IDENTITY_SERVICE_PORT`…).
 *
 * @param schema - Schéma Zod à appliquer (par défaut {@link envSchema}).
 * @param source - Source des variables (par défaut `process.env`).
 * @returns L'objet typé et validé.
 * @throws {Error} Message enrichi listant les chemins invalides.
 */
export function validateEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, unknown> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues
      .map((i) => `  • ${i.path.join('.') || '<root>'} : ${i.message}`)
      .join('\n');
    throw new Error(
      `❌ Variables d'environnement invalides :\n${lines}\n→ Vérifiez votre fichier .env`,
    );
  }
  return result.data;
}

let _config: Env | null = null;

/**
 * Retourne la configuration validée (singleton). Valide au premier appel,
 * puis renvoie la même instance sans re-valider.
 *
 * @returns L'objet {@link Env} entièrement validé.
 */
export function getConfig(): Env {
  if (!_config) {
    _config = validateEnv(envSchema);
  }
  return _config;
}

/**
 * Réinitialise le singleton. **À n'utiliser que dans les tests** pour pouvoir
 * modifier `process.env` entre deux cas.
 */
export function resetConfig(): void {
  _config = null;
}

/**
 * Singleton exporté **paresseux** : la validation n'a lieu qu'au premier
 * accès à un champ (`config.DATABASE_URL`, …). Permet :
 *   - aux tests unitaires de charger le module sans crash quand `process.env`
 *     n'est pas un environnement valide ;
 *   - aux outils CLI qui n'utilisent qu'une fraction de la config (ex.
 *     `prisma migrate`) de ne pas exiger TOUTES les variables.
 *
 * Au runtime applicatif, le premier accès vaut une validation eager :
 *   `console.log(config.DATABASE_URL)` lève si `.env` est invalide.
 *
 * @example
 * ```ts
 * import { config } from '@nina-aes/config';
 * console.log(config.DATABASE_URL);
 * ```
 */
export const config: Env = new Proxy({} as Env, {
  get(_t, prop, receiver) {
    return Reflect.get(getConfig(), prop, receiver);
  },
  has(_t, prop) {
    return prop in getConfig();
  },
  ownKeys() {
    return Reflect.ownKeys(getConfig());
  },
  getOwnPropertyDescriptor(_t, prop) {
    return Reflect.getOwnPropertyDescriptor(getConfig(), prop);
  },
});

// ──────────────────────────────────────────────────────────────────────────────
//  Constantes partagées
// ──────────────────────────────────────────────────────────────────────────────

/** Configuration CORS par défaut des passerelles d'API. */
export const CORS_CONFIG = {
  origin: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) ?? [
    'http://localhost:3000',
    'http://localhost:4001',
    'http://localhost:4002',
    'http://localhost:4003',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const,
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Correlation-ID',
    'Accept-Language',
    'X-API-Key',
  ],
  maxAge: 86400,
} as const;

/** Ports canoniques des 14 microservices (doc 07 → 11 + Bloc A/E : biometric, enrollment, ussd). */
export const SERVICE_PORTS = {
  API_GATEWAY: Number(process.env.API_GATEWAY_PORT) || 3000,
  IDENTITY_SERVICE: Number(process.env.IDENTITY_SERVICE_PORT) || 3001,
  AUTH_SERVICE: Number(process.env.AUTH_SERVICE_PORT) || 3002,
  AI_SERVICE: Number(process.env.AI_SERVICE_PORT) || 3003,
  DOCUMENT_SERVICE: Number(process.env.DOCUMENT_SERVICE_PORT) || 3004,
  NOTIFICATION_SERVICE: Number(process.env.NOTIFICATION_SERVICE_PORT) || 3005,
  INTEROP_SERVICE: Number(process.env.INTEROP_SERVICE_PORT) || 3006,
  AUDIT_SERVICE: Number(process.env.AUDIT_SERVICE_PORT) || 3007,
  APPOINTMENT_SERVICE: Number(process.env.APPOINTMENT_SERVICE_PORT) || 3008,
  ANTICORRUPTION_SERVICE: Number(process.env.ANTICORRUPTION_SERVICE_PORT) || 3009,
  GOVERNANCE_SERVICE: Number(process.env.GOVERNANCE_SERVICE_PORT) || 3010,
  VULNERABILITY_SERVICE: Number(process.env.VULNERABILITY_SERVICE_PORT) || 3011,
  BIOMETRIC_SERVICE: Number(process.env.BIOMETRIC_SERVICE_PORT) || 3012,
  ENROLLMENT_SERVICE: Number(process.env.ENROLLMENT_SERVICE_PORT) || 3013,
  USSD_SERVICE: Number(process.env.USSD_SERVICE_PORT) || 3014,
} as const;

/** Configuration de limitation de débit (rate limiting) standard. */
export const RATE_LIMIT_CONFIG = {
  short: { ttl: 1000, limit: 10 },
  medium: { ttl: 60000, limit: 100 },
  long: { ttl: 3600000, limit: 1000 },
  auth: { ttl: 900000, limit: 5 },
} as const;

// Ré-export de Zod pour que les services puissent étendre le schéma sans
// avoir à ajouter Zod à leurs propres dépendances.
export { z };
