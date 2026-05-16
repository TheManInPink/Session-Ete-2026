/**
 * @file        providers.tsx
 * @description Providers globaux côté client pour la console agent —
 *              TanStack Query avec interceptor 401 → refresh silencieux.
 *              Pattern miroir d'`apps/citizen/lib/providers.tsx`.
 * @module      @nina-aes/admin
 */

'use client';

import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

async function attemptRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

function isUnauthorizedError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === 401
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
        queryCache: new QueryCache({
          onError: async (err, query) => {
            if (isUnauthorizedError(err)) {
              const refreshed = await attemptRefresh();
              if (refreshed) query.fetch();
            }
          },
        }),
        mutationCache: new MutationCache({
          onError: async (err) => {
            if (isUnauthorizedError(err)) {
              await attemptRefresh();
            }
          },
        }),
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
