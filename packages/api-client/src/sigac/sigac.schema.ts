/**
 * @file        sigac.schema.ts
 * @description Schémas Zod pour le signalement anonyme (SIGAC — Bloc D).
 *              **Aucune PII** dans les payloads : pas de nom, pas d'email,
 *              pas d'IP côté client (le proxy strippe les headers).
 * @module      @nina-aes/api-client
 */

import { z } from 'zod';

/** Catégories de fait signalé. */
export const AlertCategorySchema = z.enum([
  'BRIBERY',
  'FORGERY',
  'FAVORITISM',
  'ABUSE_OF_POWER',
  'PROCUREMENT',
  'OTHER',
]);

export const AlertSeveritySchema = z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/** Pièce jointe (URL signée MinIO). */
export const EvidenceAttachmentSchema = z.object({
  url: z.url(),
  filename: z.string().max(200),
  contentType: z.string().max(100),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});

// NB : l'ancien DTO « anonyme en clair » (`AnonymousAlert*`) a été RETIRÉ. Le
// signalement est désormais chiffré de bout en bout dans le navigateur (contrat
// `SealedReport*` plus bas) : le serveur ne reçoit qu'un ciphertext qu'il ne
// peut pas déchiffrer.

// ── File procureur (AD-03, côté agent authentifié) ───────────────────────────

/** Bucket GROSSIER de classification (anti-corrélation, protocole §6). */
export const WhistleblowerClassificationBucketSchema = z.enum([
  'FINANCIAL_OR_POWER',
  'FRAUD_OR_LEAK',
  'OTHER_BUCKET',
]);

/** Bucket GROSSIER de sévérité (2 niveaux au lieu de 4). */
export const WhistleblowerSeverityBucketSchema = z.enum(['LOW_MED', 'HIGH_CRIT']);

/** Statuts du cycle de vie d'un signalement scellé (protocole §6.4). */
export const WhistleblowerStatusSchema = z.enum([
  'RECEIVED',
  'ACKNOWLEDGED',
  'UNDER_INVESTIGATION',
  'CLOSED_FOUNDED',
  'CLOSED_UNFOUNDED',
  'CLOSED_DUPLICATE',
]);

/**
 * Entrée de la file procureur, calquée sur `ReportStore.list_buckets()`
 * (anticorruption-service, FastAPI). Le shape **snake_case** est conservé tel
 * que renvoyé sur le fil (aucune conversion camelCase n'est employée ailleurs
 * dans ce client). AUCUN contenu déchiffrable : buckets + jour seulement.
 */
export const WhistleblowerQueueItemSchema = z.object({
  /** UUID v4 aléatoire fourni par la borne (non corrélable au plaignant). */
  id: z.string().min(1),
  classification_bucket: WhistleblowerClassificationBucketSchema,
  severity_bucket: WhistleblowerSeverityBucketSchema,
  /** JOUR de réception (`YYYY-MM-DD`) — jamais l'heure (anti-corrélation). */
  received_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: WhistleblowerStatusSchema,
  /** Schéma de scellement côté borne (jamais Ed25519 — signature ≠ chiffrement). */
  scheme: z.enum(['SEALED_BOX_X25519', 'RSA_OAEP_4096']),
  /** Version de la clé publique procureur utilisée. */
  cipher_kid: z.string().min(1),
});

/** Réponse de `GET /api/v1/sigac/whistleblower/queue` (INSPECTOR/PROSECUTOR). */
export const WhistleblowerQueueSchema = z.object({
  count: z.number().int().nonnegative(),
  reports: z.array(WhistleblowerQueueItemSchema),
});

// ── Signalement anonyme SCELLÉ (chiffrement de bout en bout côté navigateur) ──
//
// Le corps du signalement + la localisation sont chiffrés DANS LE NAVIGATEUR
// avant l'envoi ; le serveur ne stocke qu'un ciphertext qu'il ne peut PAS
// déchiffrer (déchiffrement hors-ligne par le procureur). Contrat aligné sur
// `anticorruption-service` (`SealedReportRequest` / `_build_payload`, FastAPI —
// le code Python fait foi).

/** Schéma de scellement (jamais Ed25519 : signature ≠ chiffrement). */
export const SealSchemeSchema = z.enum(['SEALED_BOX_X25519', 'RSA_OAEP_4096']);

/** Classification FINE (taxonomie backend `FINE_CLASSIFICATIONS`). */
export const FineClassificationSchema = z.enum([
  'CORRUPTION_FINANCIAL',
  'ABUSE_OF_POWER',
  'IDENTITY_FRAUD',
  'DATA_LEAK',
  'HARASSMENT',
  'OTHER',
]);

/** Sévérité FINE (taxonomie backend `FINE_SEVERITIES`). */
export const FineSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/**
 * Pont entre la catégorie d'UI (radios PC-06) et la classification fine du
 * backend (taxonomies divergentes réconciliées — finding d'audit). N'expose
 * aucune information supplémentaire (les deux voyagent en clair de toute façon).
 */
export const UI_CATEGORY_TO_FINE_CLASSIFICATION: Record<
  z.infer<typeof AlertCategorySchema>,
  z.infer<typeof FineClassificationSchema>
> = {
  BRIBERY: 'CORRUPTION_FINANCIAL',
  FORGERY: 'IDENTITY_FRAUD',
  FAVORITISM: 'ABUSE_OF_POWER',
  ABUSE_OF_POWER: 'ABUSE_OF_POWER',
  PROCUREMENT: 'CORRUPTION_FINANCIAL',
  OTHER: 'OTHER',
};

/** Longueur max du ciphertext base64 acceptée par le backend (`max_ciphertext_b64_len`). */
export const MAX_SEALED_CIPHERTEXT_B64 = 8192;

/**
 * Clé publique procureur servie par le backend, pour sceller côté navigateur.
 * `public_key` : base64 (X25519 = 32 octets bruts) ou PEM (RSA). Peut être
 * **vide** en dev si `SIGAC_PROSECUTOR_PUBKEY_*` n'est pas configuré → le client
 * DOIT refuser de soumettre plutôt que d'envoyer du clair.
 */
export const SigacPublicKeySchema = z.object({
  scheme: SealSchemeSchema,
  cipher_kid: z.string().min(1),
  public_key: z.string(),
});

/** Requête de dépôt d'un signalement scellé (`POST .../whistleblower/reports`). */
export const SealedReportRequestSchema = z.object({
  /** UUID facultatif — le backend en génère un si absent. */
  report_id: z.uuid().optional(),
  ciphertext_b64: z.string().min(1).max(MAX_SEALED_CIPHERTEXT_B64),
  scheme: SealSchemeSchema,
  cipher_kid: z.string().min(1),
  /** ⚠️ Voyage en CLAIR (limite backend documentée) — buckettée côté serveur. */
  fine_classification: FineClassificationSchema,
  /** ⚠️ Voyage en CLAIR (limite backend documentée). */
  fine_severity: FineSeveritySchema,
});

/** Reçu après dépôt : le token de suivi n'est montré qu'UNE fois au rapporteur. */
export const SealedReportReceiptSchema = z.object({
  report_id: z.string().min(1),
  /** Token opaque (128 bits, `secrets.token_urlsafe`). À conserver précieusement. */
  tracking_token: z.string().min(8).max(128),
  status: WhistleblowerStatusSchema,
});

/** Réponse de suivi (`GET .../whistleblower/reports/{token}/status`). Aucune PII. */
export const WhistleblowerStatusResponseSchema = z.object({
  status: WhistleblowerStatusSchema,
});

export type AlertCategory = z.infer<typeof AlertCategorySchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type EvidenceAttachment = z.infer<typeof EvidenceAttachmentSchema>;
export type SealScheme = z.infer<typeof SealSchemeSchema>;
export type FineClassification = z.infer<typeof FineClassificationSchema>;
export type FineSeverity = z.infer<typeof FineSeveritySchema>;
export type SigacPublicKey = z.infer<typeof SigacPublicKeySchema>;
export type SealedReportRequest = z.infer<typeof SealedReportRequestSchema>;
export type SealedReportReceipt = z.infer<typeof SealedReportReceiptSchema>;
export type WhistleblowerStatusResponse = z.infer<typeof WhistleblowerStatusResponseSchema>;
export type WhistleblowerClassificationBucket = z.infer<
  typeof WhistleblowerClassificationBucketSchema
>;
export type WhistleblowerSeverityBucket = z.infer<typeof WhistleblowerSeverityBucketSchema>;
export type WhistleblowerStatus = z.infer<typeof WhistleblowerStatusSchema>;
export type WhistleblowerQueueItem = z.infer<typeof WhistleblowerQueueItemSchema>;
export type WhistleblowerQueue = z.infer<typeof WhistleblowerQueueSchema>;
