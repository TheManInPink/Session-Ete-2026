/**
 * @file        react/index.ts
 * @description Point d'entrée du sous-chemin `@nina-aes/api-client/react`.
 *
 *              Isolé du cœur (`@nina-aes/api-client`) pour que les consommateurs
 *              non-React (USSD, scripts Node) n'aient pas à dépendre de React /
 *              TanStack Query (déclarés en `peerDependencies` optionnelles).
 *
 * @module      @nina-aes/api-client/react
 */

'use client';

export { ApiClientProvider, useApiClient, useApiMode } from './context';
export type { ApiMode } from './context';
export { queryKeys } from './query-keys';
export {
  useCitizenByNina,
  useCitizenSearch,
  useCorrections,
  useCorrection,
  useSubmitCorrection,
  useCancelCorrection,
  useApproveCorrection,
  useRejectCorrection,
  useAvailableSlots,
  useMyAppointments,
  useCreateAppointment,
  useCancelAppointment,
  useSigacPublicKey,
  useSubmitSealedReport,
  useReportStatus,
  useWhistleblowerQueue,
  useSgogtInbox,
  useSendSgogtMessage,
  useAckSgogtMessage,
  useRespondSgogtMessage,
  useVerifySgogtMessage,
  useDirectives,
  useCreateDirective,
  useTransitionDirective,
  useAdminDashboardStats,
} from './hooks';
