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
import type { CorrectionListParams, IdentitySearchParams, SlotsQuery } from '../core/client.types';
import type { CreateCorrectionDto } from '../correction/correction.schema';
import type { CreateAppointmentDto } from '../appointment/appointment.schema';
import type { AnonymousAlertDto } from '../sigac/sigac.schema';

/** Options communes aux hooks de lecture. */
interface QueryOptions {
  /** Désactive la requête tant que false (ex. argument pas encore prêt). */
  enabled?: boolean;
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

// ── appointment-service ───────────────────────────────────────────────────────

/** PC-04 — créneaux disponibles pour une plage de dates / un centre. */
export function useAvailableSlots(params: SlotsQuery, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.appointments.slots(params),
    queryFn: () => api.appointment.getAvailableSlots(params),
    enabled: (options.enabled ?? true) && params.fromDate.length > 0,
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
 * PC-06 — soumet un signalement **anonyme**.
 *
 * Aucune invalidation de cache (le lanceur d'alerte n'a pas de session), pas de
 * `Authorization` (le client anonyme strippe les credentials côté transport).
 */
export function useSubmitAlert() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (dto: AnonymousAlertDto) => api.sigac.submit(dto),
    // `anonymous` signale aux handlers d'erreur globaux de NE PAS rediriger
    // vers /login sur 401 (préservation de l'anonymat du lanceur d'alerte).
    meta: { anonymous: true },
  });
}

/** Suit l'instruction d'une alerte via son token de suivi (aucune PII). */
export function useAlertStatus(trackingToken: string, options: QueryOptions = {}) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.sigac.status(trackingToken),
    queryFn: () => api.sigac.getStatus(trackingToken),
    enabled: (options.enabled ?? true) && trackingToken.length > 0,
  });
}
