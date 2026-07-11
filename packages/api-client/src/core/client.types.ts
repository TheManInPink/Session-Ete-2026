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
  RejectCorrectionDto,
} from '../correction/correction.schema';
import type {
  Appointment,
  AppointmentList,
  CenterAvailability,
  CenterSummary,
  CreateAppointmentDto,
} from '../appointment/appointment.schema';
import type {
  SigacPublicKey,
  SealedReportRequest,
  SealedReportReceipt,
  WhistleblowerStatusResponse,
  WhistleblowerQueue,
} from '../sigac/sigac.schema';
import type {
  CreateDirectiveDto,
  DirectiveStatus,
  DirectiveView,
  MessageView,
  RespondSgogtMessageDto,
  SendSgogtMessageDto,
  SgogtAckResult,
  SgogtVerifyResult,
  TransitionDirectiveDto,
} from '../governance/governance.schema';
import type { AdminDashboardStats } from '../admin-dashboard/admin-dashboard.schema';

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

/**
 * Filtres de listing des corrections — alignés sur `ListCorrectionsDto` du
 * backend : `agent` (UUID du relecteur assigné), `from`/`to` (bornes de
 * `createdAt`, dates ISO `YYYY-MM-DD`).
 */
export type CorrectionListParams = {
  nina?: string;
  status?: string;
  agent?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/**
 * Fenêtre de disponibilité d'un centre (dates `YYYY-MM-DD`). Le `centerId` est
 * REQUIS (c'est un segment de l'URL `GET /centers/:id/availability`).
 */
export type AvailabilityQuery = {
  /** Centre ciblé (UUID = Institution.id). */
  centerId: string;
  /** Borne basse au format `YYYY-MM-DD`. */
  fromDate: string;
  /** Borne haute `YYYY-MM-DD` (≤ horizon serveur `APPOINTMENT_BOOKING_HORIZON_DAYS`). */
  toDate: string;
};

/** Filtre de listing des centres d'enrôlement (par code de région `ML-XX`). */
export type CentersQuery = {
  region?: string;
};

/** Pagination de la boîte de réception SGOGT (défauts serveur : 1 / 50). */
export type SgogtInboxParams = {
  page?: number;
  pageSize?: number;
};

/** Filtres de listing des directives Kanban (défauts serveur : 1 / 50). */
export type DirectiveListParams = {
  status?: DirectiveStatus;
  page?: number;
  pageSize?: number;
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
  /** PC-05 — corrections du citoyen authentifié (NINA dérivé du token, self-scoped). */
  listMine(): Promise<CorrectionRequest[]>;
  getById(id: string): Promise<CorrectionRequest>;
  cancel(id: string): Promise<CorrectionRequest>;
  /** AD-02 — approuve une correction `UNDER_REVIEW` (applique la modification). */
  approve(id: string): Promise<CorrectionRequest>;
  /** AD-02 — rejette une correction avec motif obligatoire (min 20 caractères). */
  reject(id: string, dto: RejectCorrectionDto): Promise<CorrectionRequest>;
}

/** Contrat appointment-service (RDV CTDEC / antennes RAVEC). */
export interface AppointmentApi {
  /** Liste les centres d'enrôlement (optionnellement filtrés par région). */
  listCenters(params?: CentersQuery): Promise<CenterSummary[]>;
  /** Disponibilités d'un centre (créneaux STANDARD/PRIORITAIRE par jour). */
  getAvailability(params: AvailabilityQuery): Promise<CenterAvailability>;
  create(dto: CreateAppointmentDto): Promise<Appointment>;
  listMine(): Promise<AppointmentList>;
  cancel(id: string): Promise<Appointment>;
}

/**
 * Contrat anticorruption-service. `submit`/`getStatus` sont **anonymes**
 * (transport sans cookie ni Authorization) ; `getQueue` est **authentifié**
 * (file procureur, réservé INSPECTOR/PROSECUTOR).
 */
export interface SigacApi {
  /** Clé publique procureur pour sceller côté navigateur (public). */
  getPublicKey(): Promise<SigacPublicKey>;
  /** Dépose un signalement déjà chiffré côté navigateur (public, anonyme). */
  submitSealedReport(req: SealedReportRequest): Promise<SealedReportReceipt>;
  /** Statut d'une instruction via le token de suivi (public, anonyme). */
  getReportStatus(trackingToken: string): Promise<WhistleblowerStatusResponse>;
  /** File procureur des signalements scellés (authentifié INSPECTOR/PROSECUTOR). */
  getQueue(): Promise<WhistleblowerQueue>;
}

/** Contrat messagerie officielle signée SGOGT (GOV-01). */
export interface GovernanceSgogtApi {
  send(dto: SendSgogtMessageDto): Promise<MessageView>;
  inbox(params?: SgogtInboxParams): Promise<MessageView[]>;
  verify(id: string): Promise<SgogtVerifyResult>;
  ack(id: string): Promise<SgogtAckResult>;
  respond(id: string, dto: RespondSgogtMessageDto): Promise<MessageView>;
}

/** Contrat directives Kanban (GOV-02). */
export interface GovernanceDirectivesApi {
  create(dto: CreateDirectiveDto): Promise<DirectiveView>;
  list(params?: DirectiveListParams): Promise<DirectiveView[]>;
  transition(id: string, dto: TransitionDirectiveDto): Promise<DirectiveView>;
}

/** Contrat governance-service (Bloc C2), en deux sous-domaines. */
export interface GovernanceApi {
  sgogt: GovernanceSgogtApi;
  directives: GovernanceDirectivesApi;
}

/**
 * Contrat du tableau de bord admin (AD-01/AD-03). Sans backend d'agrégation
 * (Bloc D), chaque section non dérivable vaut `null` — contrat honnête.
 */
export interface AdminDashboardApi {
  getStats(): Promise<AdminDashboardStats>;
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
  governance: GovernanceApi;
  adminDashboard: AdminDashboardApi;
}
