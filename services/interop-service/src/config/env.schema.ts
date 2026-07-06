/**
 * @file        env.schema.ts
 * @description Schéma Zod des variables d'environnement de l'interop-service
 *              (BCID-AES, port 3006). Échoue au démarrage (fail-fast) si une
 *              variable est invalide/absente — aucun défaut secret enfoui dans le
 *              code applicatif.
 *
 *              🔒 DURCISSEMENT PRODUCTION : en `NODE_ENV=production`, on REFUSE
 *              de démarrer si le service de confiance mTLS est désactivé
 *              (`INTEROP_TRUST_INGRESS_HEADERS=false`) — l'identité du pair DOIT
 *              alors provenir d'un vrai handshake terminé par l'ingress.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/config
 */
import { z } from 'zod';

/**
 * Parseur booléen tolérant : `z.coerce.boolean()` renvoie `true` pour toute
 * chaîne non vide (y compris `"false"`). On normalise explicitement les valeurs
 * vraies pour éviter le piège des flags `XXX=false`.
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

/** Schéma typé de l'environnement interop-service. */
export const envSchema = z.looseObject({
  // ── Réseau ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  INTEROP_SERVICE_PORT: z.coerce.number().int().positive().default(3006),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Base de données (aes_verification_logs + aes_partners) ────────────
  DATABASE_URL: z.url(),

  // ── JWT applicatif interne (RS256 via JWKS d'auth-service) ────────────
  // Sert UNIQUEMENT pour les routes d'administration/sortantes protégées par
  // un opérateur Mali (provisioning de partenaires, déclenchement d'un appel
  // sortant). Le protocole BCID-AES lui-même n'utilise PAS ce JWT (il utilise
  // mTLS + JWS Ed25519 du pair).
  AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),

  // ── Identité BCID-AES de CE nœud (Mali) ───────────────────────────────
  /** Pays opéré par ce nœud (ISO 3166-1 alpha-3). Mali par défaut. */
  INTEROP_SELF_COUNTRY: z.enum(['MLI', 'BFA', 'NER']).default('MLI'),
  /** `iss` que CE nœud place dans les JWS qu'il signe. */
  INTEROP_SELF_ISSUER: z.url().default('https://interop.nina-aes.ml'),
  /** Préfixe d'audience BCID-AES : l'`aud` attendu vaut `${PREFIX}${SELF_COUNTRY}`. */
  INTEROP_AUDIENCE_PREFIX: z.string().default('aes:'),
  /** Durée de vie des JWS de réponse signés par ce nœud (jose duration). */
  INTEROP_JWS_TTL: z.string().default('5m'),
  /** Tolérance d'horloge (s) pour nbf/exp ET fenêtre anti-replay (= ±2 min). */
  INTEROP_CLOCK_TOLERANCE_SEC: z.coerce.number().int().positive().default(120),

  // ── Redis (anti-replay jti + rate-limit glissant par pays) ────────────
  REDIS_URL: z.url().default('redis://localhost:6379'),
  /** Préfixe de toutes les clés Redis (cloisonnement multi-service). */
  REDIS_KEY_PREFIX: z.string().default('interop:'),

  // ── Rate limiting contractuel BCID-AES ────────────────────────────────
  /** Quota de requêtes entrantes par pays sur la fenêtre glissante. */
  INTEROP_RATE_LIMIT_PER_COUNTRY: z.coerce.number().int().positive().default(1000),
  /** Largeur de la fenêtre glissante (secondes). 3600 = 1 h. */
  INTEROP_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(3600),

  // ── Confiance des en-têtes mTLS injectés par l'ingress (§4.7) ──────────
  /**
   * Si `true`, on lit l'identité du pair depuis les en-têtes serveur-only
   * `ssl-client-*` RÉÉCRITS par l'ingress NGINX après vérification de la chaîne
   * contre la CA AES (le client ne peut pas les forger : l'ingress les strippe
   * en entrée). En dev local SANS ingress, mettre `false` pour utiliser le mode
   * de simulation `INTEROP_DEV_PEER_*`.
   *
   * 🔒 En production, `validateEnv` FORCE `true` : sans ingress vérifiant le
   * cert pair, l'identité-par-cert (A01/A07) n'a aucune valeur.
   */
  INTEROP_TRUST_INGRESS_HEADERS: zBool(true),
  /** Nom de l'en-tête (réécrit par l'ingress) portant le verdict de vérification. */
  INTEROP_MTLS_VERIFY_HEADER: z.string().default('ssl-client-verify'),
  /** Nom de l'en-tête portant le PEM url-encodé du cert pair. */
  INTEROP_MTLS_CERT_HEADER: z.string().default('ssl-client-cert'),

  // ── Simulation mTLS dev-only (jamais en production) ───────────────────
  /**
   * En dev/test SANS ingress, ces variables simulent le pair pour exécuter le
   * happy path. IGNORÉES si `INTEROP_TRUST_INGRESS_HEADERS=true`. Refusées en
   * production (`validateEnv`).
   */
  INTEROP_DEV_PEER_COUNTRY: z.enum(['MLI', 'BFA', 'NER']).optional(),
  INTEROP_DEV_PEER_FINGERPRINT: z.string().optional(),

  // ── Clé privée Ed25519 de signature (modèle de clé §4.2ter) ──────────
  // Ed25519 IN-PROCESS via @noble (Vault Transit ne signe PAS Ed25519). La clé
  // est chargée depuis Vault KV (lease court) au boot. Aucun défaut secret.
  VAULT_ADDR: z.url().default('http://localhost:8200'),
  VAULT_AUTH_METHOD: z.enum(['token', 'approle', 'kubernetes']).default('token'),
  VAULT_TOKEN: z.string().optional(),
  VAULT_APPROLE_ROLE_ID: z.string().optional(),
  VAULT_APPROLE_SECRET_ID: z.string().optional(),
  VAULT_KUBERNETES_ROLE: z.string().optional(),
  /** Chemin KV v2 (relatif au mount `kv/data/`) du couple de clés Ed25519. */
  VAULT_INTEROP_KEY_PATH: z.string().default('interop/signing-key'),
  /** `kid` placé dans le header JWS des réponses (rotation = nouveau kid). */
  INTEROP_SIGNING_KID: z.string().default('mli-2026-q2'),

  // ── Client SORTANT (interroger un partenaire) ─────────────────────────
  /** Timeout (ms) d'un appel sortant verify-nina vers un partenaire. */
  INTEROP_OUTGOING_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  /**
   * URLs des passerelles partenaires, CSV `PAYS=https://…`
   * (ex. `BFA=https://interop.dgec.bf/v1,NER=https://interop.dge-cin.ne/v1`).
   * Vide par défaut (partenaires non provisionnés en dev).
   */
  INTEROP_PARTNER_ENDPOINTS: z.string().default(''),

  // ── Throttle HTTP générique (protection des endpoints admin) ──────────
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
});

/** Type inféré de l'environnement validé. */
export type Env = z.infer<typeof envSchema>;

/**
 * Valide `process.env` au démarrage et renvoie l'objet typé.
 *
 * @param raw Variables brutes (`process.env`).
 * @returns Environnement validé et typé.
 * @throws Error agrégée si une variable est invalide/absente, ou si la posture
 *         de production n'est pas sûre.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'} : ${i.message}`)
      .join('\n');
    throw new Error(`[interop-service] Configuration invalide :\n${lines}`);
  }
  const env = parsed.data;

  // 🔒 DURCISSEMENT PRODUCTION — l'identité-par-cert mTLS (A01/A07) ne vaut que
  // si l'ingress vérifie réellement le cert pair. En production on REFUSE le
  // mode dégradé (simulation locale) qui ferait confiance à des en-têtes non
  // réécrits.
  if (env.NODE_ENV === 'production') {
    const errors: string[] = [];
    if (!env.INTEROP_TRUST_INGRESS_HEADERS) {
      errors.push(
        'INTEROP_TRUST_INGRESS_HEADERS doit être `true` en production ' +
          "(l'identité du pair DOIT provenir du cert mTLS vérifié par l'ingress — §4.7).",
      );
    }
    if (env.INTEROP_DEV_PEER_COUNTRY || env.INTEROP_DEV_PEER_FINGERPRINT) {
      errors.push(
        'INTEROP_DEV_PEER_* (simulation mTLS dev) sont INTERDITES en production ' +
          '(usurpation de pays triviale).',
      );
    }
    if (errors.length > 0) {
      throw new Error(
        `[interop-service] Configuration de PRODUCTION non sécurisée :\n` +
          errors.map((e) => `  - ${e}`).join('\n'),
      );
    }
  }

  return env;
}
