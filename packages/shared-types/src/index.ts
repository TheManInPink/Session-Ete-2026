/**
 * @file        index.ts
 * @description Point d’entrée du package `@nina-aes/shared-types` : réexport des énumérations,
 *              interfaces, DTOs, constantes et schémas Zod partagés entre le frontend et les microservices NestJS.

 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/shared-types
 */

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

export type {
  Location,
  Parent,
  Citizen,
  CorrectionRequest,
  Appointment,
  CorruptionAlert,
  AgentIntegrityScore,
  GovernanceDirective,
  GovernanceMessage,
  AESVerificationRequest,
  AESVerificationResponse,
  AuditLog,
  ApiResponse,
  PaginatedResponse,
  ElectoralRecord,
  KioskSession,
} from './interfaces';

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

export {
  ninaSchema,
  paginationQuerySchema,
  locationSchema,
  parentSchema,
  citizenDtoSchema,
  correctionRequestCreateSchema,
  correctionStatusFilterSchema,
  appointmentUpsertSchema,
  corruptionAlertCreateSchema,
  governanceDirectiveCreateSchema,
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
  AppointmentUpsertDto,
  CorruptionAlertCreateDto,
  GovernanceDirectiveCreateDto,
  GovernanceMessageIngestDto,
  AESVerificationRequestDto,
  AESVerificationResponseDto,
  AuditLogIngestDto,
  ElectoralRecordUpdateDto,
  KioskSessionOpenDto,
  LoginCredentialsDto,
  RefreshTokenBodyDto,
} from './dtos';
