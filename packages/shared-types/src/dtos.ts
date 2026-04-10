/**
 * @file        dtos.ts
 * @description Schémas Zod réutilisables (validation API, formulaires React, DTOs NestJS).
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

/**
 * Schéma NINA : 14 chiffres + 1 lettre majuscule.
 */
export const ninaSchema = z
  .string()
  .trim()
  .length(15)
  .regex(NINA_REGEX, 'Format NINA invalide (14 chiffres + 1 lettre A–Z)');

/**
 * Pagination query standard (page / taille).
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Localisation hiérarchique — validation stricte des chaînes non vides.
 */
export const locationSchema = z.object({
  country: z.string().min(1),
  region: z.string().min(1),
  cercle: z.string().min(1),
  commune: z.string().min(1),
  quartier: z.string().min(1),
  fraction: z.string().min(1),
  village: z.string().min(1),
  hameau: z.string().min(1),
});

/**
 * Parent — FDI.
 */
export const parentSchema = z.object({
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN']),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  nina: ninaSchema.optional(),
});

/**
 * Citoyen — création / mise à jour partielle (sans secrets).
 */
export const citizenDtoSchema = z.object({
  nina: ninaSchema,
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  sex: z.nativeEnum(Sex),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ'),
  birthPlace: locationSchema,
  residence: locationSchema,
  maritalStatus: z.nativeEnum(MaritalStatus),
  profession: z.string().min(1).max(200),
  parents: z.array(parentSchema).min(1).max(4),
  preferredLanguage: z.nativeEnum(Language).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * Création d’une demande de correction.
 */
export const correctionRequestCreateSchema = z.object({
  nina: ninaSchema,
  fieldKey: z.string().min(1).max(80),
  currentValue: z.string().max(2000),
  proposedValue: z.string().max(2000),
  aiConfidence: z.number().min(0).max(100).optional(),
});

/**
 * Filtre sur le statut des corrections (tableaux agent).
 */
export const correctionStatusFilterSchema = z.object({
  status: z.nativeEnum(CorrectionStatus).optional(),
  nina: ninaSchema.optional(),
});

/**
 * Création / mise à jour de rendez-vous (côté citoyen ou agent).
 */
export const appointmentUpsertSchema = z.object({
  nina: ninaSchema,
  status: z.nativeEnum(AppointmentStatus),
  priority: z.nativeEnum(PriorityLevel),
  vulnerability: z.nativeEnum(VulnerabilityCategory).optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  siteCode: z.string().min(1).max(32),
  language: z.nativeEnum(Language),
  notes: z.string().max(2000).optional(),
});

/**
 * Création d’alerte anticorruption.
 */
export const corruptionAlertCreateSchema = z.object({
  severity: z.nativeEnum(AlertSeverity),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(8000),
  country: z.nativeEnum(AESCountry),
  referenceId: z.string().max(128).optional(),
});

/**
 * Directive de gouvernance — création.
 */
export const governanceDirectiveCreateSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(20000),
  status: z.nativeEnum(DirectiveStatus),
  escalationLevel: z.number().int().min(0).max(10),
  country: z.nativeEnum(AESCountry),
  referenceCode: z.string().max(128).optional(),
});

/**
 * Message institutionnel signé — ingestion.
 */
export const governanceMessageIngestSchema = z.object({
  body: z.string().min(1).max(20000),
  signatureEd25519: z.string().min(1),
  publicKeyFingerprint: z.string().min(1),
  readStatus: z.enum(['unread', 'read']),
  serverTimestamp: z.string().min(1),
  /** Identifiant fournisseur d’identité (souvent UUID Keycloak, mais pas garanti) */
  fromUserId: z.string().min(1).max(128),
  toUserIds: z.array(z.string().min(1).max(128)).min(1),
});

/**
 * Requête interop AES — validation minimale des champs protocolaires.
 */
export const aesVerificationRequestSchema = z.object({
  /** Identifiant de corrélation (UUID recommandé) */
  correlationId: z.string().uuid(),
  requestingCountry: z.nativeEnum(AESCountry),
  targetCountry: z.nativeEnum(AESCountry),
  subjectId: z.string().min(1).max(256),
  assertionJws: z.string().min(1),
  issuedAt: z.string().min(1),
});

/**
 * Réponse interop AES.
 */
export const aesVerificationResponseSchema = z.object({
  correlationId: z.string().uuid(),
  respondingCountry: z.nativeEnum(AESCountry),
  verificationStatus: z.enum(['MATCH', 'NO_MATCH', 'PARTIAL', 'ERROR']),
  resultJws: z.string().min(1),
  issuedAt: z.string().min(1),
});

/**
 * Ingestion d’un journal d’audit (service signataire).
 */
export const auditLogIngestSchema = z.object({
  action: z.string().min(1).max(120),
  actorRole: z.nativeEnum(UserRole),
  resourceId: z.string().min(1).max(256),
  merkleHash: z.string().min(16),
  previousHash: z.string().min(16),
  timestamp: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Enregistrement électoral — mise à jour contrôlée.
 */
export const electoralRecordUpdateSchema = z.object({
  nina: ninaSchema,
  pollingStationCode: z.string().min(1).max(64),
  registrationStatus: z.enum(['REGISTERED', 'SUSPENDED', 'REMOVED']),
  batchMerkleRoot: z.string().min(16).optional(),
});

/**
 * Session borne — ouverture.
 */
export const kioskSessionOpenSchema = z.object({
  kioskId: z.string().min(1).max(64),
  country: z.nativeEnum(AESCountry),
  language: z.nativeEnum(Language),
  assistedMode: z.boolean(),
  /** Durée de session en secondes */
  ttlSeconds: z.number().int().min(60).max(8 * 3600),
});

/**
 * Authentification par identifiant — champs génériques (à combiner avec auth-service).
 */
export const loginCredentialsSchema = z.object({
  username: z.string().min(3).max(128),
  password: z.string().min(8).max(256),
});

/**
 * Refresh token — corps de requête.
 */
export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1),
});

/** Type inféré — pagination */
export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;
/** Type inféré — citoyen */
export type CitizenDto = z.infer<typeof citizenDtoSchema>;
/** Type inféré — création correction */
export type CorrectionRequestCreateDto = z.infer<typeof correctionRequestCreateSchema>;
/** Type inféré — rendez-vous */
export type AppointmentUpsertDto = z.infer<typeof appointmentUpsertSchema>;
/** Type inféré — alerte corruption */
export type CorruptionAlertCreateDto = z.infer<typeof corruptionAlertCreateSchema>;
/** Type inféré — directive */
export type GovernanceDirectiveCreateDto = z.infer<typeof governanceDirectiveCreateSchema>;
/** Type inféré — message gouvernance */
export type GovernanceMessageIngestDto = z.infer<typeof governanceMessageIngestSchema>;
/** Type inféré — requête interop */
export type AESVerificationRequestDto = z.infer<typeof aesVerificationRequestSchema>;
/** Type inféré — réponse interop */
export type AESVerificationResponseDto = z.infer<typeof aesVerificationResponseSchema>;
/** Type inféré — audit */
export type AuditLogIngestDto = z.infer<typeof auditLogIngestSchema>;
/** Type inféré — électoral */
export type ElectoralRecordUpdateDto = z.infer<typeof electoralRecordUpdateSchema>;
/** Type inféré — kiosque */
export type KioskSessionOpenDto = z.infer<typeof kioskSessionOpenSchema>;
/** Type inféré — login */
export type LoginCredentialsDto = z.infer<typeof loginCredentialsSchema>;
/** Type inféré — refresh */
export type RefreshTokenBodyDto = z.infer<typeof refreshTokenBodySchema>;
