/**
 * @file        client.types.ts
 * @description Interfaces structurelles des sous-clients NINA-AES.
 *
 *              Pourquoi des interfaces et pas seulement les classes ?
 *              Les classes `IdentityClient`, `CorrectionClient`, … portent un
 *              membre `private http`. En TypeScript, un membre `private` est
 *              **nominal** : un simple objet (ex. notre client *mock*) ne peut
 *              donc pas être assigné à `IdentityClient`. En extrayant un contrat
 *              purement structurel (`IdentityApi`, …), le vrai client ET le mock
 *              satisfont la même interface → la bascule mock ↔ live se fait sans
 *              changer une seule ligne côté écran (couture « data-only »).
 *
 * @module      @nina-aes/api-client
 */

import type { Citizen, CitizenSearchResult } from '../identity/identity.client';
import type {
  CorrectionList,
  CorrectionRequest,
  CreateCorrectionDto,
} from '../correction/correction.schema';
import type {
  Appointment,
  AppointmentList,
  CreateAppointmentDto,
  SlotsList,
} from '../appointment/appointment.schema';
import type {
  AnonymousAlertDto,
  AnonymousAlertReceipt,
  AnonymousAlertStatus,
} from '../sigac/sigac.schema';

// Note : on utilise des `type` (et non des `interface`) pour ces sacs de
// paramètres. Les alias de littéraux d'objet reçoivent une « index signature »
// implicite → ils restent assignables à `query: Record<string, …>` du
// HttpClient (ce qui n'est pas le cas d'une interface nommée).

/** Paramètres de recherche fuzzy de citoyens. */
export type IdentitySearchParams = {
  q?: string;
  region?: string;
  page?: number;
  pageSize?: number;
};

/** Filtres de listing des corrections. */
export type CorrectionListParams = {
  nina?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

/** Plage de dates pour la recherche de créneaux de RDV. */
export type SlotsQuery = {
  /** Borne basse au format `YYYY-MM-DD`. */
  fromDate: string;
  /** Borne haute au format `YYYY-MM-DD`. */
  toDate: string;
  centerId?: string;
};

/** Contrat identity-service (lecture citoyen). */
export interface IdentityApi {
  getByNina(nina: string): Promise<Citizen>;
  search(params: IdentitySearchParams): Promise<CitizenSearchResult>;
  getById(id: string): Promise<Citizen>;
}

/** Contrat correction-service (demandes de correction NINA). */
export interface CorrectionApi {
  submit(dto: CreateCorrectionDto): Promise<CorrectionRequest>;
  list(params?: CorrectionListParams): Promise<CorrectionList>;
  getById(id: string): Promise<CorrectionRequest>;
  cancel(id: string): Promise<CorrectionRequest>;
}

/** Contrat appointment-service (RDV CTDEC / antennes RAVEC). */
export interface AppointmentApi {
  getAvailableSlots(params: SlotsQuery): Promise<SlotsList>;
  create(dto: CreateAppointmentDto): Promise<Appointment>;
  listMine(): Promise<AppointmentList>;
  cancel(id: string): Promise<Appointment>;
}

/** Contrat anticorruption-service (signalement strictement anonyme). */
export interface SigacApi {
  submit(dto: AnonymousAlertDto): Promise<AnonymousAlertReceipt>;
  getStatus(trackingToken: string): Promise<AnonymousAlertStatus>;
}

/**
 * Façade complète consommée par les apps Next.js / mobile.
 * Implémentée par {@link createApiClient} (HTTP réel) et par
 * `createMockApiClient` (fixtures déterministes validées Zod).
 */
export interface ApiClient {
  identity: IdentityApi;
  correction: CorrectionApi;
  appointment: AppointmentApi;
  sigac: SigacApi;
}
