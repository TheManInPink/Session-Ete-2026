/**
 * @file        index.ts
 * @description Point d'entrée du package `@nina-aes/shared-types` :
 *              ré-exporte les énumérations, interfaces, constantes et schémas
 *              Zod partagés entre les apps Next.js et les microservices NestJS.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/shared-types
 */

// ── Énumérations ───────────────────────────────────────────────────────────────
export {
  Sex,
  MaritalStatus,
  CorrectionStatus,
  UserRole,
  VulnerabilityCategory,
  PriorityLevel,
  AppointmentStatus,
  DirectiveStatus,
  AlertSeverity,
  AESCountry,
  Language,
} from './enums';

// ── Interfaces métier ──────────────────────────────────────────────────────────
export type {
  Location,
  Parent,
  Citizen,
  CorrectionRequest,
  Appointment,
  CorruptionAlert,
  CorruptionAlertStatus,
  AgentIntegrityScore,
  GovernanceDirective,
  GovernanceMessage,
  GovernanceAttachment,
  AESVerificationRequest,
  AESVerificationResponse,
  AuditLog,
  ApiResponse,
  PaginatedResponse,
  ElectoralRecord,
  KioskSession,
} from './interfaces';

// ── Constantes ─────────────────────────────────────────────────────────────────
export {
  NINA_REGEX,
  NINA_FORMAT_DISPLAY,
  isValidNinaFormat,
  SUPPORTED_LANGUAGES,
  AES_COUNTRIES,
  USSD_SHORTCODE,
  VULNERABILITY_PRIORITIES,
  CORRECTION_CONFIDENCE_THRESHOLDS,
} from './constants';

export type { SupportedLanguageDef } from './constants';

// ── Schémas Zod ────────────────────────────────────────────────────────────────
export {
  ninaSchema,
  isoDateSchema,
  paginationQuerySchema,
  locationSchema,
  parentSchema,
  citizenDtoSchema,
  correctionRequestCreateSchema,
  correctionReviewSchema,
  correctionStatusFilterSchema,
  appointmentUpsertSchema,
  corruptionAlertCreateSchema,
  governanceDirectiveCreateSchema,
  governanceAttachmentSchema,
  governanceMessageIngestSchema,
  aesVerificationRequestSchema,
  aesVerificationResponseSchema,
  auditLogIngestSchema,
  electoralRecordUpdateSchema,
  kioskSessionOpenSchema,
  loginCredentialsSchema,
  refreshTokenBodySchema,
} from './dtos';

export type {
  PaginationQueryDto,
  CitizenDto,
  CorrectionRequestCreateDto,
  CorrectionReviewDto,
  AppointmentUpsertDto,
  CorruptionAlertCreateDto,
  GovernanceDirectiveCreateDto,
  GovernanceMessageIngestDto,
  GovernanceAttachmentDto,
  AESVerificationRequestDto,
  AESVerificationResponseDto,
  AuditLogIngestDto,
  ElectoralRecordUpdateDto,
  KioskSessionOpenDto,
  LoginCredentialsDto,
  RefreshTokenBodyDto,
} from './dtos';
