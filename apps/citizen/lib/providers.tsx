/**
 * @file        providers.tsx
 * @description Providers React partagés par toute l'app citoyen :
 *              TanStack Query + refresh silencieux + Toast.
 * @module      @nina-aes/citizen
 */

'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@nina-aes/api-client';
import { ApiClientProvider } from '@nina-aes/api-client/react';
import { defaultLocale, locales } from '@nina-aes/i18n';
import { createBrowserApi } from './api/browser';
import { resolveApiMode } from './api/config';

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

/**
 * Dérive la locale du pathname courant (`/fr/dashboard` → `fr`), avec repli
 * sur la locale par défaut si le premier segment n'est pas une locale connue.
 */
function localeFromPathname(pathname: string): string {
  const seg = pathname.split('/')[1] ?? '';
  return (locales as readonly string[]).includes(seg) ? seg : defaultLocale;
}

export function Providers({ children }: { children: ReactNode }) {
  // Client API (mock|live) construit une seule fois — la bascule se décide ici.
  const [apiClient] = useState(() => createBrowserApi());
  const [apiMode] = useState(() => resolveApiMode());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Le handler 401 vit dans le MutationCache (et non dans
        // defaultOptions.mutations.onError) pour avoir accès à `mutation.meta` :
        // les mutations marquées `anonymous` (signalement SIGAC) ne doivent
        // JAMAIS rediriger vers /login — cela trahirait le lanceur d'alerte.
        mutationCache: new MutationCache({
          onError: async (error, _variables, _context, mutation) => {
            if (mutation.meta?.anonymous) return;
            if (error instanceof ApiError && error.status === 401) {
              const refreshed = await attemptRefresh();
              if (!refreshed && typeof window !== 'undefined') {
                const locale = localeFromPathname(window.location.pathname);
                window.location.href =
                  `/${locale}/login?next=` + encodeURIComponent(window.location.pathname);
              }
            }
          },
        }),
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
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient} mode={apiMode}>
        {children}
      </ApiClientProvider>
    </QueryClientProvider>
  );
}
