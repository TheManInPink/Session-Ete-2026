/**
 * @file        hooks.ts
 * @description Hooks TanStack Query typés enveloppant {@link ApiClient}.
 *
 *              Chaque hook lit le client via {@link useApiClient} : il fonctionne
 *              donc à l'identique en mode mock et en mode live. Les mutations
 *              invalident les caches concernés pour rafraîchir l'UI.
 *
 *              Convention de nommage alignée sur le besoin écran (PC-02→PC-06,
 *              AD-*, GOV-*). Les services non encore couverts par le client
 *              (document, ai, governance…) seront ajoutés au fil des tranches.
 *
 * @module      @nina-aes/api-client/react
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './context';
import { queryKeys } from './query-keys';
import type {
  AvailabilityQuery,
  CentersQuery,
  CorrectionListParams,
  DirectiveListParams,
  IdentitySearchParams,
  SgogtInboxParams,
} from '../core/client.types';
import type { CreateCorrectionDto } from '../correction/correction.schema';
import type { CreateAppointmentDto } from '../appointment/appointment.schema';
import type { SealedReportRequest } from '../sigac/sigac.schema';
import type {
  CreateDirectiveDto,
  SendSgogtMessageDto,
  TransitionDirectiveDto,
} from '../governance/governance.schema';

/** Options communes aux hooks de lecture. */
interface QueryOptions {
  /** Désactive la requête tant que false (ex. argument pas encore prêt). */
  enabled?: boolean;
}

/** Options de lecture avec polling optionnel (files d'attente, inbox…). */
interface PollingQueryOptions extends QueryOptions {
  /** Intervalle de re-fetch en ms (`false` = pas de polling — défaut). */
  refetchInterval?: number | false;
}

// ── identity-service ──────────────────────────────────────────────────────────

/** PC-02 — récupère un citoyen par son NINA. */
export function useCitizenByNina(nina: string, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.citizen.byNina(nina),
    queryFn: () => api.identity.getByNina(nina),
    enabled: (options.enabled ?? true) && nina.length > 0,
  });
}

/** Recherche fuzzy de citoyens (admin). */
export function useCitizenSearch(params: IdentitySearchParams, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.citizen.search(params),
    queryFn: () => api.identity.search(params),
    enabled: options.enabled ?? true,
  });
}

// ── correction-service ────────────────────────────────────────────────────────

/** PC-05 / AD-02 — liste des corrections (filtrable). */
export function useCorrections(params: CorrectionListParams = {}, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.corrections.list(params),
    queryFn: () => api.correction.list(params),
    enabled: options.enabled ?? true,
  });
}

/** PC-05 — détail d'une correction, avec polling optionnel (suivi temps réel). */
export function useCorrection(
  id: string,
  options: QueryOptions & { refetchInterval?: number | false } = {},
) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.corrections.detail(id),
    queryFn: () => api.correction.getById(id),
    enabled: (options.enabled ?? true) && id.length > 0,
    refetchInterval: options.refetchInterval ?? false,
  });
}

/** PC-03 — soumet une demande de correction puis invalide la liste. */
export function useSubmitCorrection() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCorrectionDto) => api.correction.submit(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.corrections.all }),
  });
}

/** Annule une correction (DRAFT/SUBMITTED) puis invalide la liste. */
export function useCancelCorrection() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.correction.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.corrections.all }),
  });
}

/** AD-02 — approuve une correction `UNDER_REVIEW` puis invalide les listes. */
export function useApproveCorrection() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.correction.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.corrections.all }),
  });
}

/**
 * AD-02 — rejette une correction avec motif obligatoire (min 20 caractères)
 * puis invalide les listes.
 */
export function useRejectCorrection() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.correction.reject(id, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.corrections.all }),
  });
}

// ── appointment-service ───────────────────────────────────────────────────────

/** PC-04 — centres d'enrôlement (optionnellement filtrés par région `ML-XX`). */
export function useCenters(params: CentersQuery = {}, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.appointments.centers(params.region),
    queryFn: () => api.appointment.listCenters(params),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

/** PC-04 — disponibilités d'un centre (créneaux STANDARD/PRIORITAIRE par jour). */
export function useCenterAvailability(params: AvailabilityQuery, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.appointments.availability(params),
    queryFn: () => api.appointment.getAvailability(params),
    enabled: (options.enabled ?? true) && params.centerId.length > 0 && params.fromDate.length > 0,
  });
}

/** PC-05 — liste des rendez-vous du citoyen connecté. */
export function useMyAppointments(options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.appointments.mine(),
    queryFn: () => api.appointment.listMine(),
    enabled: options.enabled ?? true,
  });
}

/** PC-04 — crée un rendez-vous puis invalide la liste « mes RDV ». */
export function useCreateAppointment() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAppointmentDto) => api.appointment.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.appointments.all }),
  });
}

/** Annule un rendez-vous puis invalide la liste. */
export function useCancelAppointment() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.appointment.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.appointments.all }),
  });
}

// ── anticorruption-service (SIGAC) ────────────────────────────────────────────

/**
 * PC-06 — récupère la clé publique procureur pour **sceller côté navigateur**.
 * Requête publique (anonyme), mise en cache (la clé change rarement).
 */
export function useSigacPublicKey(options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.sigac.publicKey(),
    queryFn: () => api.sigac.getPublicKey(),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    meta: { anonymous: true },
  });
}

/**
 * PC-06 — dépose un signalement **déjà scellé** (chiffré côté navigateur).
 *
 * Aucune invalidation de cache (le lanceur d'alerte n'a pas de session), pas de
 * `Authorization` (le transport anonyme strippe cookie + `X-Correlation-Id`).
 */
export function useSubmitSealedReport() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (req: SealedReportRequest) => api.sigac.submitSealedReport(req),
    // `anonymous` : les handlers d'erreur globaux NE redirigent PAS vers /login
    // sur 401 (préservation de l'anonymat du lanceur d'alerte).
    meta: { anonymous: true },
  });
}

/** Suit l'instruction d'un signalement via son token de suivi (aucune PII). */
export function useReportStatus(trackingToken: string, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.sigac.status(trackingToken),
    queryFn: () => api.sigac.getReportStatus(trackingToken),
    enabled: (options.enabled ?? true) && trackingToken.length > 0,
    meta: { anonymous: true },
  });
}

/**
 * AD-03 — file procureur des signalements scellés (buckets + jour, aucun
 * contenu). Endpoint **authentifié** (INSPECTOR/PROSECUTOR), contrairement au
 * canal anonyme de soumission.
 */
export function useWhistleblowerQueue(options: PollingQueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.sigac.queue(),
    queryFn: () => api.sigac.getQueue(),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
  });
}

// ── governance-service — SGOGT (GOV-01) ───────────────────────────────────────

/**
 * GOV-01 — boîte de réception SGOGT du fonctionnaire connecté, avec polling
 * optionnel (`refetchInterval`) pour surveiller les échéances d'escalade.
 */
export function useSgogtInbox(params: SgogtInboxParams = {}, options: PollingQueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.governance.sgogt.inbox(params),
    queryFn: () => api.governance.sgogt.inbox(params),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
  });
}

/** GOV-01 — émet un message officiel signé puis invalide l'inbox. */
export function useSendSgogtMessage() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SendSgogtMessageDto) => api.governance.sgogt.send(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.governance.sgogt.all }),
  });
}

/** GOV-01 — accuse réception (ACK signé lecteur) puis invalide l'inbox. */
export function useAckSgogtMessage() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.governance.sgogt.ack(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.governance.sgogt.all }),
  });
}

/** GOV-01 — répond à un message (clôt la décision) puis invalide l'inbox. */
export function useRespondSgogtMessage() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api.governance.sgogt.respond(id, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.governance.sgogt.all }),
  });
}

/** GOV-01 — vérifie la signature d'un message (contrôle à la demande). */
export function useVerifySgogtMessage(id: string, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.governance.sgogt.verify(id),
    queryFn: () => api.governance.sgogt.verify(id),
    enabled: (options.enabled ?? true) && id.length > 0,
  });
}

// ── governance-service — directives Kanban (GOV-02) ───────────────────────────

/** GOV-02 — liste des directives (filtrable par colonne Kanban). */
export function useDirectives(params: DirectiveListParams = {}, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.governance.directives.list(params),
    queryFn: () => api.governance.directives.list(params),
    enabled: options.enabled ?? true,
  });
}

/** GOV-02 — crée une directive (DRAFT) puis invalide le Kanban. */
export function useCreateDirective() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateDirectiveDto) => api.governance.directives.create(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.governance.directives.all }),
  });
}

/**
 * GOV-02 — applique une transition Kanban puis invalide le Kanban. Restreindre
 * les drops côté UI via `DIRECTIVE_LEGAL_TRANSITIONS` (le serveur — et le mock
 * — rejettent 400 toute transition illégale ; `note` obligatoire si REJECTED).
 */
export function useTransitionDirective() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & TransitionDirectiveDto) =>
      api.governance.directives.transition(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.governance.directives.all }),
  });
}

// ── Dashboard admin (AD-01 / AD-03) ───────────────────────────────────────────

/**
 * AD-01 — statistiques agrégées du dashboard. Chaque section non dérivable
 * d'un backend existant vaut `null` (agrégation Bloc D non implémentée) :
 * l'écran doit prévoir un état « indisponible ».
 */
export function useAdminDashboardStats(options: PollingQueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.adminDashboard.stats(),
    queryFn: () => api.adminDashboard.getStats(),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
  });
}
