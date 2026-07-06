/**
 * @file        providers.tsx
 * @description Providers globaux côté client pour le portail gouvernance :
 *              TanStack Query (401 → refresh silencieux → redirection login) +
 *              ApiClientProvider (bascule mock ↔ live). Pattern miroir
 *              d'apps/citizen (ADR-031).
 * @module      @nina-aes/governance
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
 * Dérive la locale courante du pathname (préfixe `[locale]` systématique,
 * cf. proxy.ts `localePrefix: 'always'`). Repli sur la locale par défaut.
 */
function localeFromPathname(pathname: string): string {
  const segment = pathname.split('/')[1] ?? '';
  return (locales as readonly string[]).includes(segment) ? segment : defaultLocale;
}

export function Providers({ children }: { children: ReactNode }) {
  // Client API (mock|live) construit une seule fois — la bascule se décide ici.
  const [apiClient] = useState(() => createBrowserApi());
  const [apiMode] = useState(() => resolveApiMode());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Le handler 401 vit dans le MutationCache : sur une mutation SGOGT ou
        // directive expirée, on tente un refresh silencieux puis, à défaut, on
        // renvoie vers /login en conservant la locale courante et la page cible.
        mutationCache: new MutationCache({
          onError: async (error) => {
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
              // Pas de retry sur les erreurs 4xx (saisie invalide, transition
              // illégale, accès refusé) — seules les erreurs serveur/réseau
              // méritent une nouvelle tentative.
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
