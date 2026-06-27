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

  // ── Authentification de l'origine (§9.4, anti-falsification d'acteur) ──
  /**
   * Si `true`, l'origine d'un message AMQP DOIT être authentifiée par une
   * signature `x-nina-signature` valide (Ed25519) vérifiée contre la clé
   * publique du publisher (cf. `AUDIT_PUBLISHER_KEYS`) AVANT tout `append` :
   * tout message non signé / mal signé / d'émetteur inconnu est DROPPÉ
   * (fail-closed). Si `false`, posture fail-open BORNÉE : on trace l'émetteur
   * mais on n'exige pas la signature (transition Phase 2, confiance mTLS canal).
   *
   * 🔒 En `NODE_ENV=production`, ce flag est FORCÉ à `true` par `validateEnv`
   * (refus de boot si laissé à `false` explicitement) : on ne tolère pas le
   * fail-open en production. Défaut `false` (dev/test, publishers non encore
   * signés).
   */
  AUDIT_REQUIRE_SIGNED_ORIGIN: z.coerce.boolean().default(false),
  /**
   * Clés publiques Ed25519 des publishers autorisés, au format CSV
   * `appId:publicKeyHex` (ex. `identity-service:3b6a…,document-service:9f2c…`).
   * La signature `x-nina-signature` d'un message est vérifiée contre la clé de
   * son émetteur (`appId`/`x-nina-source`). Vide par défaut (aucun publisher
   * signé déployé en dev). ⏳ Phase 2 : chargé depuis Vault KV.
   */
  AUDIT_PUBLISHER_KEYS: z.string().default(''),

  // ── Batching (perf : insertion groupée) ───────────────────────────────
  AUDIT_BATCH_MAX_SIZE: z.coerce.number().int().positive().default(1000),
  AUDIT_BATCH_INTERVAL_MS: z.coerce.number().int().positive().default(500),

  // ── Vault (clé Ed25519 de scellement de racine) ───────────────────────
  // 🔒 DURCISSEMENT P1/P7 (ADR-034) — JAMAIS de VAULT_TOKEN long-lived par
  // défaut (cf. CANON sécurité / MEMORY / THREAT-MODEL #7). On privilégie
  // AppRole (TTL court, auto-renew par le client) ou Kubernetes ServiceAccount.
  // Le mode `token` reste autorisé pour le dev local (Vault `vault server -dev`),
  // mais SANS valeur par défaut codée en dur — un secret ne doit jamais être
  // « baked-in » dans le schéma. Pattern AS-BUILT aligné sur document-service /
  // auth-service (`buildAuthConfig`).
  VAULT_ADDR: z.url().default('http://localhost:8200'),
  VAULT_AUTH_METHOD: z.enum(['token', 'approle', 'kubernetes']).default('token'),
  VAULT_TOKEN: z.string().optional(),
  VAULT_APPROLE_ROLE_ID: z.string().optional(),
  VAULT_APPROLE_SECRET_ID: z.string().optional(),
  VAULT_KUBERNETES_ROLE: z.string().optional(),
  /** Chemin KV v2 (relatif au mount `kv/data/`) du couple de clés Ed25519. */
  VAULT_AUDIT_KEY_PATH: z.string().default('audit/signing-key'),
  /** Active le scellement horaire de la racine (désactivable en test). */
  AUDIT_SEAL_ENABLED: z.coerce.boolean().default(true),

  // ── Throttle (endpoints de preuve coûteux) ────────────────────────────
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(60),

  // ── Anti-désanonymisation (THREAT-MODEL #12, ADR-023 SIGAC) ────────────
  // Sur le chemin lanceur d'alerte / SIGAC (et idéalement par défaut), on
  // HACHE/TRONQUE l'IP + le `correlationId` avant persistance : le SOC peut
  // corréler par hash (pepper côté serveur) sans voir la valeur brute, ce qui
  // empêche un initié de désanonymiser un lanceur d'alerte en croisant
  // IP + correlationId + horodatage du scellement. La détection SOC légitime
  // (corrélation) reste possible car le hachage est déterministe.
  /**
   * Préfixes de routing (CSV) traités comme SENSIBLES (lanceurs d'alerte / SIGAC)
   * : IP tronquée + correlationId haché systématiquement. Défaut : `vulnerability.`
   * (canal SIGAC, ADR-023).
   */
  AUDIT_SENSITIVE_ROUTE_PREFIXES: z.string().default('vulnerability.'),
  /**
   * Si `true`, applique l'anti-corrélation (IP tronquée + correlationId haché) à
   * TOUS les événements, pas seulement aux routes sensibles. Défense par défaut
   * contre la désanonymisation d'un lanceur d'alerte (THREAT-MODEL #12).
   *
   * 🔒 En `NODE_ENV=production`, ce flag est FORCÉ à `true` par `validateEnv`
   * (refus de boot s'il est laissé à `false` explicitement) : IP tronquée +
   * correlationId haché s'appliquent par défaut, pas seulement aux routes
   * sensibles. Défaut `false` hors production (rétro-compatible SOC dev/test).
   */
  AUDIT_ANONYMIZE_ALL: z.coerce.boolean().default(false),
  /**
   * Poivre (pepper) du hachage de corrélation. NE JAMAIS journaliser. Permet au
   * SOC de re-corréler un correlationId connu sans exposer l'espace de valeurs
   * brutes (anti-dictionnaire d'UUID, THREAT-MODEL #12).
   *
   * 🔒 AUCUN défaut codé en dur (un pepper connu d'un initié/DBA = attaque par
   * dictionnaire → désanonymisation). Chargé depuis Vault KV au boot par
   * `AuditNormalizer` (même pattern fail-fast que `signing.service.ts`,
   * chemin `VAULT_AUDIT_PEPPER_PATH`). Cette variable d'env reste un repli
   * dev/test FACULTATIF ; en `NODE_ENV=production`, `validateEnv` exige une
   * valeur non vide ET non triviale si Vault est indisponible.
   */
  AUDIT_CORRELATION_PEPPER: z.string().optional(),
  /** Chemin KV v2 (relatif au mount `kv/data/`) du pepper de corrélation. */
  VAULT_AUDIT_PEPPER_PATH: z.string().default('audit/correlation-pepper'),
});

/** Valeur de pepper historiquement codée en dur — désormais REFUSÉE en prod. */
const FORBIDDEN_DEV_PEPPER = 'nina-audit-dev-pepper';

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
  const env = parsed.data;

  // 🔒 DURCISSEMENT PRODUCTION (THREAT-MODEL #12 / §9.4) — on n'autorise pas en
  // production les postures « fail-open » ou « anti-désanonymisation off » ni un
  // pepper trivial. Hors production (dev/test/staging), ces options restent
  // souples pour ne pas freiner le développement.
  if (env.NODE_ENV === 'production') {
    const errors: string[] = [];

    // (1) Origine : pas de fail-open silencieux en prod — la signature publisher
    // est exigée par défaut (le code la vérifie réellement, cf. audit.consumer).
    if (!env.AUDIT_REQUIRE_SIGNED_ORIGIN) {
      errors.push(
        'AUDIT_REQUIRE_SIGNED_ORIGIN doit être `true` en production ' +
          "(fail-open d'origine interdit hors dev — §9.4).",
      );
    }

    // (2) Anti-désanonymisation : active par défaut en prod (lanceur d'alerte).
    if (!env.AUDIT_ANONYMIZE_ALL) {
      errors.push(
        'AUDIT_ANONYMIZE_ALL doit être `true` en production ' +
          '(IP tronquée + correlationId haché par défaut — THREAT-MODEL #12).',
      );
    }

    // (3) Pepper : ni vide, ni la valeur de dev historique. La valeur réelle est
    // chargée depuis Vault par le normalizer ; cette variable n'est qu'un repli.
    // Si elle est présente, elle ne doit pas être triviale/connue.
    if (env.AUDIT_CORRELATION_PEPPER !== undefined) {
      if (env.AUDIT_CORRELATION_PEPPER.trim().length < 16) {
        errors.push(
          'AUDIT_CORRELATION_PEPPER (repli) doit faire ≥ 16 caractères en production ' +
            '(préférer le chargement Vault `VAULT_AUDIT_PEPPER_PATH`).',
        );
      }
      if (env.AUDIT_CORRELATION_PEPPER === FORBIDDEN_DEV_PEPPER) {
        errors.push(
          'AUDIT_CORRELATION_PEPPER ne doit JAMAIS être la valeur de dev codée en dur ' +
            "(pepper connu = attaque par dictionnaire d'UUID).",
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `[audit-service] Configuration de PRODUCTION non sécurisée :\n` +
          errors.map((e) => `  - ${e}`).join('\n'),
      );
    }
  }

  return env;
}
