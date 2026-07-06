/**
 * @file        index.ts
 * @description Point d'entrée du package `@nina-aes/api-client`.
 *
 *              Usage typique :
 *              ```ts
 *              import { createApiClient } from '@nina-aes/api-client';
 *              const api = createApiClient({ baseUrl: process.env.API_BASE_URL! });
 *              const citizen = await api.identity.getByNina('18903102015042Z');
 *              ```
 *
 * @module      @nina-aes/api-client
 */

import { HttpClient, type HttpClientOptions } from './core/http-client';
import { IdentityClient } from './identity/identity.client';
import { CorrectionClient } from './correction/correction.client';
import { AppointmentClient } from './appointment/appointment.client';
import { SigacClient } from './sigac/sigac.client';
import { GovernanceClient } from './governance/governance.client';
import { AdminDashboardClient } from './admin-dashboard/admin-dashboard.client';
import type { ApiClient } from './core/client.types';

/**
 * Crée une instance ApiClient **HTTP réelle** prête à l'emploi.
 *
 * Au fur et à mesure que les services backend sont livrés (docs 07 → 11), de
 * nouveaux sous-clients seront ajoutés ici (auth, document, audit, …).
 * Pour le mode démo/hors-ligne, voir {@link createMockApiClient}.
 */
export function createApiClient(opts: HttpClientOptions): ApiClient {
  const http = new HttpClient(opts);
  const correction = new CorrectionClient(http);
  return {
    identity: new IdentityClient(http),
    correction,
    appointment: new AppointmentClient(http),
    sigac: new SigacClient(http),
    governance: new GovernanceClient(http),
    // L'agrégateur AD-01 compose le sous-client corrections (même transport).
    adminDashboard: new AdminDashboardClient(correction),
  };
}

// ── Réexports core ──────────────────────────────────────────────────────────
export { HttpClient } from './core/http-client';
export type { HttpClientOptions, RequestOptions } from './core/http-client';
export { ApiError, ApiNetworkError, ApiValidationError } from './core/errors';
export type { ApiErrorBody } from './core/errors';
export type {
  ApiClient,
  IdentityApi,
  CorrectionApi,
  AppointmentApi,
  SigacApi,
  GovernanceApi,
  GovernanceSgogtApi,
  GovernanceDirectivesApi,
  AdminDashboardApi,
  IdentitySearchParams,
  CorrectionListParams,
  SlotsQuery,
  SgogtInboxParams,
  DirectiveListParams,
} from './core/client.types';

// ── Client mock (fixtures déterministes, zéro réseau) ────────────────────────
export { createMockApiClient } from './mock/mock-client';

// ── Réexports identity ──────────────────────────────────────────────────────
export type { Citizen, CitizenSearchResult } from './identity/identity.client';
export { CitizenResponseSchema, CitizenSearchResultSchema } from './identity/identity.client';
export { generateDemoCitizen } from './identity/demo-citizen';
export type { DemoCitizen, DemoParent } from './identity/demo-citizen';
export { ficheFromCitizen, ficheFromDemo } from './identity/citizen-fiche';
export type { CitizenFiche } from './identity/citizen-fiche';

// ── Réexports correction ────────────────────────────────────────────────────
export {
  CorrectionStatusSchema,
  CorrectionFieldSchema,
  CreateCorrectionDtoSchema,
  RejectCorrectionDtoSchema,
  AiVerdictSchema,
} from './correction/correction.schema';
export type {
  CorrectionStatus,
  CorrectionField,
  CorrectionRequest,
  CreateCorrectionDto,
  RejectCorrectionDto,
  CorrectionList,
  CorrectionCitizenJoin,
  AiVerdict,
} from './correction/correction.schema';

// ── Réexports appointment ───────────────────────────────────────────────────
export {
  AppointmentStatusSchema,
  PriorityLevelSchema,
  CreateAppointmentDtoSchema,
} from './appointment/appointment.schema';
export type {
  AppointmentStatus,
  PriorityLevel,
  Slot,
  Appointment,
  CreateAppointmentDto,
  SlotsList,
  AppointmentList,
} from './appointment/appointment.schema';

// ── Réexports sigac ─────────────────────────────────────────────────────────
export {
  AlertCategorySchema,
  AlertSeveritySchema,
  SealSchemeSchema,
  FineClassificationSchema,
  FineSeveritySchema,
  UI_CATEGORY_TO_FINE_CLASSIFICATION,
  MAX_SEALED_CIPHERTEXT_B64,
  SigacPublicKeySchema,
  SealedReportRequestSchema,
  SealedReportReceiptSchema,
  WhistleblowerStatusResponseSchema,
  WhistleblowerQueueSchema,
} from './sigac/sigac.schema';
export type {
  AlertCategory,
  AlertSeverity,
  EvidenceAttachment,
  SealScheme,
  FineClassification,
  FineSeverity,
  SigacPublicKey,
  SealedReportRequest,
  SealedReportReceipt,
  WhistleblowerStatusResponse,
  WhistleblowerClassificationBucket,
  WhistleblowerSeverityBucket,
  WhistleblowerStatus,
  WhistleblowerQueueItem,
  WhistleblowerQueue,
} from './sigac/sigac.schema';

// ── Réexports governance (SGOGT + directives Kanban) ────────────────────────
export {
  SgogtPrioritySchema,
  SgogtMessageStatusSchema,
  MessageViewSchema,
  SendSgogtMessageDtoSchema,
  RespondSgogtMessageDtoSchema,
  DirectiveStatusSchema,
  DirectiveViewSchema,
  CreateDirectiveDtoSchema,
  TransitionDirectiveDtoSchema,
  DIRECTIVE_LEGAL_TRANSITIONS,
  isDirectiveTransitionAllowed,
} from './governance/governance.schema';
export type {
  SgogtPriority,
  SgogtMessageStatus,
  MessageView,
  SendSgogtMessageDto,
  RespondSgogtMessageDto,
  SgogtVerifyResult,
  SgogtAckResult,
  DirectiveStatus,
  DirectiveView,
  CreateDirectiveDto,
  TransitionDirectiveDto,
} from './governance/governance.schema';

// ── Réexports admin-dashboard (AD-01/AD-03) ─────────────────────────────────
export {
  AdminDashboardStatsSchema,
  AlertEntrySchema,
} from './admin-dashboard/admin-dashboard.schema';
export type {
  AdminKpiKey,
  AdminKpiSnapshot,
  DailyCorrectionCount,
  RegionActivity,
  AgentIntegrity,
  AlertEntry,
  AdminDashboardStats,
} from './admin-dashboard/admin-dashboard.schema';

// ── Constantes mock partagées (personas, annuaire, fils SGOGT) ──────────────
export {
  DEFAULT_MOCK_NINA,
  MOCK_ADMIN_REVIEWER_ID,
  MOCK_GOVERNANCE_DIRECTORY,
  MOCK_GOVERNANCE_USER_ID,
  MOCK_SECOND_REVIEWER_ID,
  MOCK_SGOGT_THREAD_IDS,
} from './mock/mock-client';
export type { MockGovernanceOfficial } from './mock/mock-client';
