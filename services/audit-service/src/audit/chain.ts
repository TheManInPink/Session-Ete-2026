/**
 * @file        chain.ts
 * @description Primitives cryptographiques PURES de la chaîne d'audit Merkle.
 *
 *              Volontairement SANS dépendance NestJS ni Prisma : ces fonctions
 *              sont la « source de vérité » du calcul de hash et sont
 *              ré-implémentées à l'identique dans le script offline
 *              `scripts/verify-chain.ts` (preuve indépendante). Toute
 *              modification ici DOIT être répercutée là-bas.
 *
 *              Modèle :
 *                payloadHash = SHA256( JCS(payload métier) )
 *                merkleHash  = SHA256( previousHash | payloadHash
 *                                      | occurredAt(ISO) | sourceEventId )
 *
 *              JCS = JSON Canonicalization Scheme (RFC 8785) : sérialisation
 *              déterministe (clés triées, pas d'espaces) → reproductible
 *              bit-à-bit quel que soit l'ordre d'insertion des clés.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

/** Racine de la chaîne (hash du « bloc 0 » fictif) : 64 zéros hexadécimaux. */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Sérialisation JSON CANONIQUE déterministe : clés d'objets triées
 * (récursivement), ordre des tableaux préservé. Indispensable car PostgreSQL
 * réordonne les clés des colonnes `JSONB` au stockage : sans tri, le
 * `payloadHash` recalculé à la vérification ne correspondrait plus.
 *
 * Volontairement minimal (pas de dépendance externe) pour être réimplémenté
 * À L'IDENTIQUE dans `scripts/verify-chain.ts` (preuve offline indépendante).
 */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sort((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/**
 * Champs métier d'un événement d'audit couverts par `payloadHash`.
 * `occurredAt` n'y figure pas : il est couvert par `merkleHash` (anti-rejeu
 * temporel). `id`/`createdAt` (métadonnées gérées par PostgreSQL) ne sont pas
 * hashés.
 */
export interface AuditChainFields {
  userId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  correlationId: string | null;
  sourceEventId: string;
}

/**
 * Calcule le SHA-256 (hex) d'une chaîne de caractères ou d'octets.
 *
 * @param input Texte (encodé UTF-8) ou octets bruts.
 * @returns Empreinte SHA-256 sur 64 caractères hexadécimaux.
 */
export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return bytesToHex(sha256(bytes));
}

/**
 * Construit l'objet canonique du payload métier (valeurs `undefined`
 * normalisées en `null` pour un hash déterministe côté serveur ET côté
 * script offline qui lit des colonnes SQL `NULL`).
 */
function toCanonicalObject(fields: AuditChainFields): Record<string, unknown> {
  return {
    action: fields.action,
    actorType: fields.actorType,
    correlationId: fields.correlationId ?? null,
    entityId: fields.entityId ?? null,
    entityType: fields.entityType,
    ipAddress: fields.ipAddress ?? null,
    newValue: fields.newValue ?? null,
    oldValue: fields.oldValue ?? null,
    sourceEventId: fields.sourceEventId,
    userId: fields.userId ?? null,
  };
}

/**
 * Calcule le hash canonique (JCS RFC 8785 → SHA-256) du payload métier.
 *
 * @param fields Champs métier de l'événement.
 * @returns Empreinte hexadécimale (64 chars).
 * @throws Error si le payload n'est pas canonicalisable (valeur non JSON).
 */
export function computePayloadHash(fields: AuditChainFields): string {
  return sha256Hex(canonicalJson(toCanonicalObject(fields)));
}

/**
 * Calcule le `merkleHash` d'une entrée à partir du hash précédent.
 *
 * @param params.previousHash  `merkleHash` de l'entrée N-1 (ou GENESIS_HASH).
 * @param params.payloadHash   `payloadHash` de l'entrée courante.
 * @param params.occurredAt    Horodatage métier (Date ou ISO string).
 * @param params.sourceEventId Identifiant d'événement source (idempotence).
 * @returns `merkleHash` hexadécimal (64 chars).
 */
export function computeMerkleHash(params: {
  previousHash: string;
  payloadHash: string;
  occurredAt: Date | string;
  sourceEventId: string;
}): string {
  const iso =
    params.occurredAt instanceof Date ? params.occurredAt.toISOString() : params.occurredAt;
  const concat = `${params.previousHash}|${params.payloadHash}|${iso}|${params.sourceEventId}`;
  return sha256Hex(concat);
}
