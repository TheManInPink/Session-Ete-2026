/**
 * @file        providers.tsx
 * @description Providers React partagés par toute l'app citoyen :
 *              TanStack Query + refresh silencieux + Toast.
 * @module      @nina-aes/citizen
 */

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@nina-aes/api-client';

/**
 * Tente un refresh des tokens en appelant POST /api/auth/refresh.
 *
 * @returns `true` si le refresh a réussi, `false` sinon (l'app doit alors
 *          rediriger vers /login).
 */
async function attemptRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Pas de retry sur les erreurs 4xx (input utilisateur invalide)
              if (error instanceof ApiError && error.isUserError) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: 0,
            // Sur 401, tenter un refresh silencieux puis rediriger si KO
            onError: async (error) => {
              if (error instanceof ApiError && error.status === 401) {
                const refreshed = await attemptRefresh();
                if (!refreshed && typeof window !== 'undefined') {
                  window.location.href =
                    '/fr/login?next=' + encodeURIComponent(window.location.pathname);
                }
              }
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
