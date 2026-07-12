/**
 * @file        query-keys.ts
 * @description Fabrique centralisée de clés TanStack Query.
 *
 *              Une seule source de vérité pour les `queryKey` : évite les
 *              divergences entre la lecture (useQuery) et l'invalidation
 *              (invalidateQueries) après mutation.
 *
 * @module      @nina-aes/api-client/react
 */

import type {
  AvailabilityQuery,
  CorrectionListParams,
  DirectiveListParams,
  IdentitySearchParams,
  SgogtInboxParams,
} from '../core/client.types';

/** Arborescence des clés de cache, regroupées par domaine. */
export const queryKeys = {
  citizen: {
    all: ['citizen'] as const,
    byNina: (nina: string) => ['citizen', 'by-nina', nina] as const,
    byId: (id: string) => ['citizen', 'by-id', id] as const,
    search: (params: IdentitySearchParams) => ['citizen', 'search', params] as const,
  },
  corrections: {
    all: ['corrections'] as const,
    list: (params?: CorrectionListParams) => ['corrections', 'list', params ?? {}] as const,
    detail: (id: string) => ['corrections', 'detail', id] as const,
  },
  appointments: {
    all: ['appointments'] as const,
    centers: (region?: string) => ['appointments', 'centers', region ?? 'all'] as const,
    availability: (params: AvailabilityQuery) => ['appointments', 'availability', params] as const,
    mine: () => ['appointments', 'mine'] as const,
  },
  sigac: {
    all: ['sigac'] as const,
    publicKey: () => ['sigac', 'public-key'] as const,
    status: (token: string) => ['sigac', 'status', token] as const,
    queue: () => ['sigac', 'queue'] as const,
  },
  governance: {
    all: ['governance'] as const,
    sgogt: {
      all: ['governance', 'sgogt'] as const,
      inbox: (params?: SgogtInboxParams) => ['governance', 'sgogt', 'inbox', params ?? {}] as const,
      verify: (id: string) => ['governance', 'sgogt', 'verify', id] as const,
    },
    directives: {
      all: ['governance', 'directives'] as const,
      list: (params?: DirectiveListParams) =>
        ['governance', 'directives', 'list', params ?? {}] as const,
    },
  },
  adminDashboard: {
    all: ['admin-dashboard'] as const,
    stats: () => ['admin-dashboard', 'stats'] as const,
  },
} as const;
