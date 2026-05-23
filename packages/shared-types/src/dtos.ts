/**
 * @file        dtos.ts
 * @description Schémas Zod réutilisables (validation API, formulaires React,
 *              DTOs NestJS) — strictement alignés sur les interfaces de
 *              `interfaces.ts`.
 *
 *              Convention : un schéma Zod par opération (création, mise à
 *              jour, ingestion). Les types inférés sont ré-exportés pour
 *              être consommés sans avoir à manipuler Zod côté appelant.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/shared-types
 */

import { z } from 'zod';

import {
  AESCountry,
  AlertSeverity,
  AppointmentStatus,
  CorrectionStatus,
  DirectiveStatus,
  Language,
  MaritalStatus,
  PriorityLevel,
  Sex,
  UserRole,
  VulnerabilityCategory,
} from './enums';
import { NINA_REGEX } from './constants';

// ──────────────────────────────────────────────────────────────────────────────
//  Schémas atomiques
// ──────────────────────────────────────────────────────────────────────────────

/** NINA : 14 chiffres + 1 lettre majuscule. */
export const ninaSchema = z
  .string()
  .trim()
  .length(15)
  .regex(NINA_REGEX, 'Format NINA invalide (14 chiffres + 1 lettre A–Z)');

/** Date ISO simplifiée AAAA-MM-JJ. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

/** Pagination query standard (page / taille). */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Localisation hiérarchique sur 10 niveaux. */
export const locationSchema = z.object({
  id: z.string().uuid(),
  countryCode: z.string().length(3),
  pays: z.string().min(1),
  région: z.string().min(1),
  cercle: z.string().min(1),
  commune: z.string().min(1),
  quartier: z.string().min(1),
  fraction: z.string().min(1),
  village: z.string().min(1),
  hameau: z.string().min(1),
});

/** Parent — FDI. */
export const parentSchema = z.object({
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN']),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  nina: ninaSchema.optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Citoyen
// ──────────────────────────────────────────────────────────────────────────────

/** Citoyen — création / mise à jour (sans secrets, sans IDs serveurs). */
export const citizenDtoSchema = z.object({
  nina: ninaSchema,
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  sex: z.nativeEnum(Sex),
  birthDate: isoDateSchema,
  birthPlace: locationSchema,
  residence: locationSchema,
  maritalStatus: z.nativeEnum(MaritalStatus),
  profession: z.string().min(1).max(200),
  parents: z.array(parentSchema).min(1).max(4),
  photoUrl: z.string().url().optional(),
  fingerprintHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  vulnerabilityCategory: z.nativeEnum(VulnerabilityCategory).optional(),
  preferredLanguage: z.nativeEnum(Language).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Demandes de correction
// ──────────────────────────────────────────────────────────────────────────────

/** Création d'une demande de correction. */
export const correctionRequestCreateSchema = z.object({
  citizenId: z.string().uuid(),
  nina: ninaSchema,
  fieldKey: z.string().min(1).max(80),
  currentValue: z.string().max(2000),
  proposedValue: z.string().max(2000),
  aiConfidence: z.number().min(0).max(100).optional(),
  justificationDocUrl: z.string().url().optional(),
});

/** Statut de revue agent (approbation / rejet). */
export const correctionReviewSchema = z.object({
  status: z.enum([CorrectionStatus.APPROVED, CorrectionStatus.REJECTED]),
  reviewedBy: z.string().uuid(),
  reviewerNote: z.string().max(2000).optional(),
});

/** Filtre sur le statut des corrections (tableaux agent). */
export const correctionStatusFilterSchema = z.object({
  status: z.nativeEnum(CorrectionStatus).optional(),
  nina: ninaSchema.optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Rendez-vous
// ──────────────────────────────────────────────────────────────────────────────

/** Création / mise à jour de rendez-vous. */
export const appointmentUpsertSchema = z.object({
  citizenId: z.string().uuid(),
  nina: ninaSchema,
  status: z.nativeEnum(AppointmentStatus),
  priority: z.nativeEnum(PriorityLevel),
  vulnerability: z.nativeEnum(VulnerabilityCategory).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  centerId: z.string().uuid(),
  queueNumber: z.number().int().positive(),
  language: z.nativeEnum(Language),
  notes: z.string().max(2000).optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Anti-corruption (SIGAC)
// ──────────────────────────────────────────────────────────────────────────────

/** Création d'alerte anticorruption. */
export const corruptionAlertCreateSchema = z.object({
  severity: z.nativeEnum(AlertSeverity),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(8000),
  country: z.nativeEnum(AESCountry),
  agentUserId: z.string().uuid().optional(),
  evidenceUrls: z.array(z.string().url()).max(20).default([]),
  anonymousReporterToken: z.string().min(8).max(128).optional(),
  referenceId: z.string().max(128).optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Gouvernance (SGOGT)
// ──────────────────────────────────────────────────────────────────────────────

/** Directive de gouvernance — création. */
export const governanceDirectiveCreateSchema = z.object({
  issuerId: z.string().uuid(),
  assigneeId: z.string().uuid(),
  institutionId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(20000),
  status: z.nativeEnum(DirectiveStatus),
  priority: z.nativeEnum(PriorityLevel),
  deadline: z.string().min(1),
  escalationLevel: z.number().int().min(0).max(10),
  country: z.nativeEnum(AESCountry),
  referenceCode: z.string().max(128).optional(),
});

/** Pièce jointe d'un message gouvernance. */
export const governanceAttachmentSchema = z.object({
  filename: z.string().min(1).max(256),
  url: z.string().url(),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});

/** Message institutionnel signé — ingestion. */
export const governanceMessageIngestSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  attachments: z.array(governanceAttachmentSchema).max(20).default([]),
  signatureEd25519: z.string().min(1),
  publicKeyFingerprint: z.string().min(1),
  readStatus: z.enum(['unread', 'read']),
  serverTimestamp: z.string().min(1),
  fromUserId: z.string().min(1).max(128),
  recipientIds: z.array(z.string().min(1).max(128)).min(1),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Interopérabilité AES
// ──────────────────────────────────────────────────────────────────────────────

/** Requête interop AES — vérification transfrontalière. */
export const aesVerificationRequestSchema = z.object({
  correlationId: z.string().uuid(),
  requestingCountry: z.nativeEnum(AESCountry),
  targetCountry: z.nativeEnum(AESCountry),
  nina: ninaSchema,
  lastName: z.string().min(1).max(120),
  birthDate: isoDateSchema,
  signature: z.string().min(1),
  issuedAt: z.string().min(1),
});

/** Réponse interop AES. */
export const aesVerificationResponseSchema = z.object({
  correlationId: z.string().uuid(),
  respondingCountry: z.nativeEnum(AESCountry),
  verified: z.boolean(),
  confidence: z.number().min(0).max(100),
  matchFields: z.array(z.string()).default([]),
  timestamp: z.string().min(1),
  signature: z.string().min(1),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Audit
// ──────────────────────────────────────────────────────────────────────────────

/** Ingestion d'un journal d'audit (service signataire). */
export const auditLogIngestSchema = z.object({
  userId: z.string().uuid(),
  action: z.string().min(1).max(120),
  actorRole: z.nativeEnum(UserRole),
  entityType: z.string().min(1).max(80),
  entityId: z.string().min(1).max(256),
  oldValue: z.string().max(20000).optional(),
  newValue: z.string().max(20000).optional(),
  ipAddress: z.string().max(64).optional(),
  merkleHash: z.string().min(16),
  previousHash: z.string().min(16),
  signature: z.string().min(1),
  timestamp: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Électoral / kiosque / auth
// ──────────────────────────────────────────────────────────────────────────────

/** Enregistrement électoral — mise à jour contrôlée. */
export const electoralRecordUpdateSchema = z.object({
  nina: ninaSchema,
  pollingStationCode: z.string().min(1).max(64),
  registrationStatus: z.enum(['REGISTERED', 'SUSPENDED', 'REMOVED']),
  batchMerkleRoot: z.string().min(16).optional(),
});

/** Session borne — ouverture. */
export const kioskSessionOpenSchema = z.object({
  kioskId: z.string().min(1).max(64),
  country: z.nativeEnum(AESCountry),
  language: z.nativeEnum(Language),
  assistedMode: z.boolean(),
  /** Durée de session en secondes (1 min – 8 h). */
  ttlSeconds: z
    .number()
    .int()
    .min(60)
    .max(8 * 3600),
});

/** Authentification par identifiant. */
export const loginCredentialsSchema = z.object({
  username: z.string().min(3).max(128),
  password: z.string().min(8).max(256),
});

/** Refresh token — corps de requête. */
export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1),
});

// ──────────────────────────────────────────────────────────────────────────────
//  Types inférés (consommables sans manipuler Zod)
// ──────────────────────────────────────────────────────────────────────────────

/** Type inféré — pagination. */
export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;
/** Type inféré — citoyen. */
export type CitizenDto = z.infer<typeof citizenDtoSchema>;
/** Type inféré — création correction. */
export type CorrectionRequestCreateDto = z.infer<typeof correctionRequestCreateSchema>;
/** Type inféré — revue de correction. */
export type CorrectionReviewDto = z.infer<typeof correctionReviewSchema>;
/** Type inféré — rendez-vous. */
export type AppointmentUpsertDto = z.infer<typeof appointmentUpsertSchema>;
/** Type inféré — alerte corruption. */
export type CorruptionAlertCreateDto = z.infer<typeof corruptionAlertCreateSchema>;
/** Type inféré — directive. */
export type GovernanceDirectiveCreateDto = z.infer<typeof governanceDirectiveCreateSchema>;
/** Type inféré — message gouvernance. */
export type GovernanceMessageIngestDto = z.infer<typeof governanceMessageIngestSchema>;
/** Type inféré — pièce jointe gouvernance. */
export type GovernanceAttachmentDto = z.infer<typeof governanceAttachmentSchema>;
/** Type inféré — requête interop. */
export type AESVerificationRequestDto = z.infer<typeof aesVerificationRequestSchema>;
/** Type inféré — réponse interop. */
export type AESVerificationResponseDto = z.infer<typeof aesVerificationResponseSchema>;
/** Type inféré — audit. */
export type AuditLogIngestDto = z.infer<typeof auditLogIngestSchema>;
/** Type inféré — électoral. */
export type ElectoralRecordUpdateDto = z.infer<typeof electoralRecordUpdateSchema>;
/** Type inféré — kiosque. */
export type KioskSessionOpenDto = z.infer<typeof kioskSessionOpenSchema>;
/** Type inféré — login. */
export type LoginCredentialsDto = z.infer<typeof loginCredentialsSchema>;
/** Type inféré — refresh. */
export type RefreshTokenBodyDto = z.infer<typeof refreshTokenBodySchema>;
