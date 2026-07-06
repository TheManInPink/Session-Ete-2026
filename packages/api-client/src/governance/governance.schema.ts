/**
 * @file        governance.schema.ts
 * @description Schémas Zod du domaine gouvernance (Bloc C2) : messagerie
 *              officielle signée SGOGT (GOV-01) et directives Kanban (GOV-02).
 *
 *              Calqués sur governance-service (le code fait foi) :
 *                - `sgogt/sgogt.service.ts` (`MessageView`) + `dto/sgogt.schema.ts`
 *                - `directives/directives.service.ts` (`DirectiveView`) +
 *                  `dto/directive.schema.ts` + `directive.state-machine.ts`
 *
 *              ⚠️ La signature des messages est un **JWS compact RS256** émis
 *              CÔTÉ SERVEUR via Vault Transit (ADR-026/034) — le client ne
 *              signe RIEN et n'envoie aucun matériel de clé.
 *
 * @module      @nina-aes/api-client
 */

import { z } from 'zod';

// ── Vocabulaire partagé ───────────────────────────────────────────────────────

/** Classifications d'urgence (pilotent le TTL d'escalade SGOGT). */
export const SgogtPrioritySchema = z.enum(['NORMAL', 'HIGH', 'CRITICAL']);

/** Cycle de vie d'un message SGOGT signé (enum Prisma `SgogtStatus`). */
export const SgogtMessageStatusSchema = z.enum([
  'SENT',
  'READ',
  'RESPONDED',
  'ESCALATED',
  'ARCHIVED',
]);

/** JWS compact RFC 7515 : `header.payload.signature` en base64url. */
const JWS_COMPACT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Hash SHA-256 hexadécimal (hash-chain linéaire par fil). */
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * Identifiant d'utilisateur institutionnel. Côté backend c'est un `User.id`
 * UUID ; on reste sur `string` (comme l'interface `MessageView` du service)
 * pour que l'identifiant de session mock (`mock-gov-001`) valide aussi.
 */
const GovUserIdSchema = z.string().min(1);

// ── SGOGT — messagerie officielle signée (GOV-01) ────────────────────────────

/**
 * Vue publique d'un message SGOGT, calquée sur `MessageView`
 * (`sgogt.service.ts`). Toutes les dates sont des ISO 8601 UTC.
 */
export const MessageViewSchema = z.object({
  id: z.uuid(),
  /** Fil de décision — couvert par la signature. */
  threadId: z.uuid(),
  senderId: GovUserIdSchema,
  recipientId: GovUserIdSchema,
  subject: z.string(),
  body: z.string(),
  priority: SgogtPrioritySchema,
  status: SgogtMessageStatusSchema,
  /** Échéance d'escalade (CRITICAL ≈ 4 h, sinon 24 h) — signée, immuable. */
  ttlEscalateAt: z.iso.datetime(),
  /** Supérieur ayant pris le relais après escalade. */
  escalatedToId: GovUserIdSchema.nullable(),
  readAt: z.iso.datetime().nullable(),
  respondedAt: z.iso.datetime().nullable(),
  /** JWS compact RS256 (signé côté serveur via Vault Transit — jamais client). */
  jwsSignature: z.string().regex(JWS_COMPACT_REGEX),
  /** Maillon de hash-chain SHA-256 linéaire du fil (PAS un arbre de Merkle). */
  chainHash: z.string().regex(SHA256_HEX_REGEX),
  createdAt: z.iso.datetime(),
});

/**
 * Corps de `POST /api/v1/sgogt/messages` — calqué sur `sendMessageSchema` du
 * backend. L'émetteur n'est JAMAIS transmis (résolu du JWT côté serveur).
 */
export const SendSgogtMessageDtoSchema = z
  .object({
    /** Destinataire (FK User.id, UUID). */
    recipientId: z.uuid(),
    /** Objet de la décision. */
    subject: z.string().trim().min(1).max(300),
    /** Corps (décision). Signé via son SHA-256 côté serveur, jamais brut. */
    body: z.string().trim().min(1).max(20_000),
    /** Classification d'urgence (défaut NORMAL). */
    priority: SgogtPrioritySchema.default('NORMAL'),
    /** Fil existant (UUID) — sinon un nouveau fil est créé côté serveur. */
    threadId: z.uuid().optional(),
  })
  .strict();

/** Corps de `POST /api/v1/sgogt/messages/:id/respond` (clôt la décision). */
export const RespondSgogtMessageDtoSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
  })
  .strict();

/** Réponse de `GET /api/v1/sgogt/messages/:id/verify`. */
export const SgogtVerifyResultSchema = z.object({
  /** `true` si signature + cohérence claims↔colonnes + bodyHash concordent. */
  valid: z.boolean(),
});

/**
 * Réponse de `POST /api/v1/sgogt/messages/:id/ack` : le message passé `READ`
 * + l'accusé de réception **signé par le lecteur** (non-répudiation).
 */
export const SgogtAckResultSchema = z.object({
  message: MessageViewSchema,
  ackJws: z.string().regex(JWS_COMPACT_REGEX),
});

// ── Directives Kanban (GOV-02) ────────────────────────────────────────────────

/** Colonnes Kanban (enum Prisma `GovernanceTaskStatus`). */
export const DirectiveStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
]);

export type DirectiveStatus = z.infer<typeof DirectiveStatusSchema>;

/**
 * Transitions **légales** de la machine à états serveur
 * (`directive.state-machine.ts`) — partagée mock/consommateurs pour que l'UI
 * Kanban restreigne les drops AVANT l'appel réseau. Toute transition hors de
 * cette carte est rejetée 400 par le serveur (et par le mock).
 */
export const DIRECTIVE_LEGAL_TRANSITIONS: Readonly<
  Record<DirectiveStatus, readonly DirectiveStatus[]>
> = {
  DRAFT: ['SENT', 'REJECTED'],
  SENT: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};

/**
 * Indique si la transition `from → to` est autorisée par la machine à états.
 *
 * @param from - Statut courant de la directive.
 * @param to   - Statut cible envisagé (drop Kanban).
 */
export function isDirectiveTransitionAllowed(from: DirectiveStatus, to: DirectiveStatus): boolean {
  return DIRECTIVE_LEGAL_TRANSITIONS[from].includes(to);
}

/** Vue publique d'une directive, calquée sur `DirectiveView` du backend. */
export const DirectiveViewSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: DirectiveStatusSchema,
  priority: SgogtPrioritySchema,
  createdById: GovUserIdSchema,
  assigneeId: GovUserIdSchema.nullable(),
  deadline: z.iso.datetime().nullable(),
  /** Niveau d'escalade (0 = initial). */
  escalationLevel: z.number().int().nonnegative(),
  rejectionReason: z.string().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Corps de `POST /api/v1/directives` — calqué sur `createDirectiveSchema`. */
export const CreateDirectiveDtoSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(20_000),
    priority: SgogtPrioritySchema.default('NORMAL'),
    /** Responsable de l'exécution (FK User.id). Optionnel à la création. */
    assigneeId: z.uuid().optional(),
    /** Échéance (ISO 8601 complet, offset accepté). */
    deadline: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/**
 * Corps de `POST /api/v1/directives/:id/transition` — calqué sur
 * `transitionDirectiveSchema` (la `note` est **obligatoire** pour `REJECTED`).
 */
export const TransitionDirectiveDtoSchema = z
  .object({
    /** Statut cible. */
    toStatus: DirectiveStatusSchema,
    /** Note de transition (obligatoire pour un REJECTED). */
    note: z.string().trim().min(1).max(2000).optional(),
    /** Réassignation éventuelle (FK User.id). */
    assigneeId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => v.toStatus !== 'REJECTED' || (v.note !== undefined && v.note.length > 0), {
    message: 'note est requise pour un rejet (REJECTED)',
    path: ['note'],
  });

// ── Types inférés ─────────────────────────────────────────────────────────────

export type SgogtPriority = z.infer<typeof SgogtPrioritySchema>;
export type SgogtMessageStatus = z.infer<typeof SgogtMessageStatusSchema>;
export type MessageView = z.infer<typeof MessageViewSchema>;
/** Type d'entrée (priority optionnelle — défaut `NORMAL` appliqué au parse). */
export type SendSgogtMessageDto = z.input<typeof SendSgogtMessageDtoSchema>;
export type RespondSgogtMessageDto = z.infer<typeof RespondSgogtMessageDtoSchema>;
export type SgogtVerifyResult = z.infer<typeof SgogtVerifyResultSchema>;
export type SgogtAckResult = z.infer<typeof SgogtAckResultSchema>;
export type DirectiveView = z.infer<typeof DirectiveViewSchema>;
/** Type d'entrée (priority optionnelle — défaut `NORMAL` appliqué au parse). */
export type CreateDirectiveDto = z.input<typeof CreateDirectiveDtoSchema>;
export type TransitionDirectiveDto = z.infer<typeof TransitionDirectiveDtoSchema>;
