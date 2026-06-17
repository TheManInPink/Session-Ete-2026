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

import type { CorrectionListParams, IdentitySearchParams, SlotsQuery } from '../core/client.types';

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
    slots: (params: SlotsQuery) => ['appointments', 'slots', params] as const,
    mine: () => ['appointments', 'mine'] as const,
  },
  sigac: {
    all: ['sigac'] as const,
    status: (token: string) => ['sigac', 'status', token] as const,
  },
} as const;
