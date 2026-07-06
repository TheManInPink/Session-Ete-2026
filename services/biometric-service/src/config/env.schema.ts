/**
 * @file        env.schema.ts
 * @description Schéma Zod des variables d'environnement du biometric-service
 *              (Bloc F, port 3012 — le module le plus sensible). Échoue au
 *              démarrage (fail-fast) si une variable est invalide/absente — aucun
 *              défaut implicite enfoui dans le code.
 *
 *              ⚠️  Secrets : aucun secret en clair ici. Le PARAMÈTRE CANCELABLE
 *              (« sel » de projection ISO/IEC 24745, distance-préservant) vit dans
 *              Vault (chemin `transit/keys/bio-transform`, kv-v2 versionné /
 *              Transit `derived` exportable — cf. INCIDENT-PROTOCOL §1.3), JAMAIS
 *              en base, JAMAIS dans cette config. La clé PRIVÉE du citoyen (qui
 *              signe le consentement JWS Ed25519) vit sur SON appareil ; l'État
 *              n'ancre que sa clé PUBLIQUE (registre Bloc A).
 *
 *              CANON crypto (DPIA §6.3, CONSENT-PROTOCOL §3.1) :
 *                - Ed25519 = SIGNATURE seulement (consentement), JAMAIS chiffrement.
 *                - Vault Transit ne supporte PAS Ed25519 — le paramètre cancelable
 *                  est un secret de PROJECTION, pas un HMAC ni une clé Ed25519.
 *                - Aucune image brute ni template en clair n'est jamais journalisé.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/config
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

/** Schéma typé de l'environnement biometric-service. */
export const envSchema = z
  .looseObject({
    // ── Réseau ────────────────────────────────────────────────────────────
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    BIOMETRIC_SERVICE_PORT: z.coerce.number().int().positive().default(3012),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // ── Base de données ───────────────────────────────────────────────────
    DATABASE_URL: z.url(),

    // ── JWT agent (vérification RS256 via JWKS d'auth-service) ────────────
    AUTH_JWKS_URL: z.url().default('http://localhost:3002/.well-known/jwks.json'),
    /**
     * Émetteur attendu (`iss`) — OBLIGATOIRE. Un token sans `iss` ou émis par un
     * autre IdP est rejeté (même contrat que identity-service).
     */
    AUTH_JWT_ISSUER: z.string().default('nina-aes-auth'),
    /**
     * Audience attendue (`aud`) — vérifiée INCONDITIONNELLEMENT. Avec un JWKS
     * partagé entre services internes RS256, l'`aud` est le seul rempart contre la
     * réutilisation d'un token émis pour un AUTRE service.
     */
    AUTH_JWT_AUDIENCE: z.string().default('nina-biometric-service'),

    // ── RabbitMQ (publication des événements d'audit vers audit-service) ──
    RABBITMQ_URL: z.url().default('amqp://localhost:5672'),
    /** Exchange topic du bus d'événements métier (consommé par audit-service). */
    RABBITMQ_EVENTS_EXCHANGE: z.string().default('nina.events'),
    /** Active la publication d'audit RabbitMQ (désactivable en test/CI). */
    BIOMETRIC_AUDIT_ENABLED: zBool(true),

    // ── Vault (paramètre cancelable ISO/IEC 24745, révocable) ─────────────
    VAULT_ADDR: z.url().default('http://localhost:8200'),
    VAULT_AUTH_METHOD: z.enum(['token', 'approle', 'kubernetes']).default('token'),
    VAULT_TOKEN: z.string().optional(),
    VAULT_APPROLE_ROLE_ID: z.string().optional(),
    VAULT_APPROLE_SECRET_ID: z.string().optional(),
    VAULT_KUBERNETES_ROLE: z.string().optional(),
    /**
     * Active l'accès Vault (lecture du paramètre cancelable). Désactivable en
     * test/CI (`false`) — un paramètre cancelable de DÉVELOPPEMENT déterministe est
     * alors dérivé localement (jamais en production : voir `CancelableModule`).
     */
    BIOMETRIC_VAULT_ENABLED: zBool(true),
    /**
     * Chemin Vault du SECRET de transformation cancelable (« sel » de projection).
     * Référencé par son `kid` ; le secret lui-même n'apparaît jamais en base.
     */
    BIOMETRIC_TRANSFORM_SECRET_PATH: z.string().default('kv/data/biometric/bio-transform'),

    // ── Protection de template ISO/IEC 24745 (cancelable) ─────────────────
    /**
     * `transform_kid` ACTIF pour les NOUVEAUX enrôlements (versionné, rotation =
     * nouveau kid). Pendant une rotation en double-écriture, l'ancien kid reste
     * matchable (boucle multi-kids du verify) jusqu'à clôture (§4.5).
     */
    BIOMETRIC_ACTIVE_TRANSFORM_KID: z.string().default('bio-transform-v1'),
    /**
     * Dimension de la projection aléatoire (longueur du code signe binarisé). Plus
     * elle est grande, plus la distance de Hamming est discriminante (au prix du
     * stockage). Doit être identique entre enrôlement et vérification d'un même kid.
     */
    BIOMETRIC_PROJECTION_DIM: z.coerce.number().int().positive().default(512),
    /**
     * Seuil τ par défaut (distance de Hamming NORMALISÉE) sous lequel deux
     * templates protégés sont déclarés « match » (`distance ≤ τ`). Point d'opération
     * à MESURER sur la courbe DET en P3a (cibles FAR ≤ 0,01 % / FRR ≈ 1–3 %). Une
     * valeur PLUS BASSE = plus strict (FAR ↓, FRR ↑).
     */
    BIOMETRIC_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.32),
    /** Métrique de comparaison figée à l'enrôlement (traçabilité du point DET). */
    BIOMETRIC_MATCH_METRIC: z.string().default('hamming-normalized'),

    // ── Consentement JWS Ed25519 (CONSENT-PROTOCOL) ───────────────────────
    /**
     * Audience attendue dans le JWS de consentement (`aud`) — liaison contextuelle
     * anti-relais : le consentement est destiné À CE service d'enrôlement.
     */
    BIOMETRIC_CONSENT_AUDIENCE: z.string().default('nina-biometric-service'),
    /**
     * Tolérance d'horloge (secondes) appliquée aux bornes `nbf`/`exp` signées du
     * consentement (capture hors-ligne synchronisée plus tard — CONSENT §5).
     */
    BIOMETRIC_CONSENT_CLOCK_TOLERANCE_SEC: z.coerce.number().int().min(0).default(60),

    // ── Anti-bruteforce du verify 1:1 (FAR ~1e-4 brute-forçable par volume) ─
    /**
     * Nombre maximal d'échecs de vérification par `(agent, citizen)` avant
     * verrouillage temporaire + alerte SIEM (DPIA §6.5). Sans cela, le seuil τ est
     * contournable par volume de probes.
     */
    BIOMETRIC_VERIFY_MAX_FAILURES: z.coerce.number().int().positive().default(5),
    /** Fenêtre (secondes) de comptage des échecs + durée du verrouillage. */
    BIOMETRIC_VERIFY_LOCKOUT_SEC: z.coerce.number().int().positive().default(900),

    // ── Store PARTAGÉ du compteur anti-bruteforce (Redis) ─────────────────
    /**
     * URL Redis du compteur d'échecs PARTAGÉ entre réplicas. ⚠️ Le verrouillage
     * anti-bruteforce est le SEUL contrôle qui rend le seuil τ non contournable par
     * volume (DPIA §6.5) : un compteur EN MÉMOIRE par réplica laisse passer
     * `N × réplicas` essais par fenêtre (chaque réplica compte 1/N du trafic). En
     * production multi-réplicas le store DOIT être partagé, sinon le contrôle est
     * inefficace à la topologie ciblée (K3s, doc 25 §2).
     */
    REDIS_URL: z.url().default('redis://localhost:6379'),
    /** Préfixe des clés Redis du service (isolation multi-tenant du store). */
    REDIS_KEY_PREFIX: z.string().default('biometric:'),
    /**
     * Active le compteur anti-bruteforce PARTAGÉ (Redis). En production il DOIT
     * être `true` (sinon fail-fast au boot — le verrouillage serait contournable
     * par réplica, DPIA §6.5). En dev/test (`false`) on retombe sur un compteur EN
     * MÉMOIRE mono-instance, suffisant pour les tests.
     */
    BIOMETRIC_FAILURE_STORE_REDIS: zBool(false),

    // ── GATE DE GOUVERNANCE RGPD/DPIA (BLOQUANT en production) ─────────────
    /**
     * La DPIA biométrie a-t-elle été SIGNÉE par le CISO/DPO CTDEC ? Sans signature,
     * le module NE SE DÉPLOIE PAS en production (gate bloquant — DPIA §10, doc 25
     * §1). En dev/test le flag par défaut reste `false` et le service démarre, mais
     * en `NODE_ENV=production` un `false` interrompt le boot (fail-fast).
     */
    BIOMETRIC_DPIA_SIGNED: zBool(false),

    // ── Throttle HTTP (protection des endpoints) ──────────────────────────
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(60),

    // ── Limite de taille du corps HTTP (anti-amplification mémoire) ───────
    /**
     * Borne explicite Express : une capture biométrique encodée (vecteur ISO +
     * consentement JWS) ne doit pas dépasser quelques centaines de Ko. Défaut 2 Mo.
     */
    HTTP_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(2_097_152),
  })
  .superRefine((env, ctx) => {
    // FAIL-FAST PRODUCTION : le compteur anti-bruteforce DOIT être partagé (Redis)
    // en production. Un compteur EN MÉMOIRE est mono-réplica : sous la topologie
    // multi-réplicas ciblée (K3s, doc 25 §2), chaque réplica garderait son propre
    // compteur ⇒ `N × réplicas` essais autorisés par fenêtre et l'alerte SIEM
    // tardive/absente. Le SEUL contrôle qui rend le seuil τ non contournable par
    // volume (DPIA §6.5) serait alors inefficace → on REFUSE de démarrer.
    if (env.NODE_ENV === 'production' && !env.BIOMETRIC_FAILURE_STORE_REDIS) {
      ctx.addIssue({
        code: 'custom',
        path: ['BIOMETRIC_FAILURE_STORE_REDIS'],
        message:
          'doit être `true` en production : le verrouillage anti-bruteforce exige un store ' +
          'partagé (Redis), sinon il est contournable par réplica (DPIA §6.5).',
      });
    }
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
    throw new Error(`[biometric-service] Configuration invalide :\n${lines}`);
  }
  return parsed.data;
}
