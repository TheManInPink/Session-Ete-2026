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
import type { ApiClient } from './core/client.types';

/**
 * Crée une instance ApiClient **HTTP réelle** prête à l'emploi.
 *
 * Au fur et à mesure que les services backend sont livrés (docs 07 → 11), de
 * nouveaux sous-clients seront ajoutés ici (auth, document, audit, gov, …).
 * Pour le mode démo/hors-ligne, voir {@link createMockApiClient}.
 */
export function createApiClient(opts: HttpClientOptions): ApiClient {
  const http = new HttpClient(opts);
  return {
    identity: new IdentityClient(http),
    correction: new CorrectionClient(http),
    appointment: new AppointmentClient(http),
    sigac: new SigacClient(http),
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
  IdentitySearchParams,
  CorrectionListParams,
  SlotsQuery,
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
} from './correction/correction.schema';
export type {
  CorrectionStatus,
  CorrectionField,
  CorrectionRequest,
  CreateCorrectionDto,
  CorrectionList,
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
  AnonymousAlertDtoSchema,
} from './sigac/sigac.schema';
export type {
  AlertCategory,
  AlertSeverity,
  EvidenceAttachment,
  AnonymousAlertDto,
  AnonymousAlertReceipt,
  AnonymousAlertStatus,
} from './sigac/sigac.schema';
