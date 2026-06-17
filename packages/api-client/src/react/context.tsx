/**
 * @file        context.tsx
 * @description Contexte React fournissant l'instance {@link ApiClient} et le
 *              mode courant (`mock` | `live`) à toute la sous-arborescence.
 *
 *              Les hooks (`useCitizenByNina`, …) lisent ce contexte plutôt que
 *              d'instancier un client : la bascule mock ↔ live se décide une
 *              seule fois, au niveau du `<ApiClientProvider>`, sans toucher aux
 *              écrans.
 *
 * @module      @nina-aes/api-client/react
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from '../core/client.types';

/** Mode d'alimentation des données : fixtures locales ou backend réel. */
export type ApiMode = 'mock' | 'live';

interface ApiClientContextValue {
  client: ApiClient;
  mode: ApiMode;
}

const ApiClientContext = createContext<ApiClientContextValue | null>(null);

/**
 * Fournit le client API et le mode aux hooks descendants.
 *
 * @param client - Instance réelle ou mock (déjà choisie par l'app).
 * @param mode   - Mode courant, exposé via {@link useApiMode} (bannières démo…).
 */
export function ApiClientProvider({
  client,
  mode,
  children,
}: {
  client: ApiClient;
  mode: ApiMode;
  children: ReactNode;
}) {
  return <ApiClientContext.Provider value={{ client, mode }}>{children}</ApiClientContext.Provider>;
}

/** Récupère le client API courant. @throws si hors d'un `<ApiClientProvider>`. */
export function useApiClient(): ApiClient {
  const ctx = useContext(ApiClientContext);
  if (!ctx) {
    throw new Error('useApiClient doit être utilisé dans un <ApiClientProvider>.');
  }
  return ctx.client;
}

/** Récupère le mode courant (`mock` | `live`). @throws hors provider. */
export function useApiMode(): ApiMode {
  const ctx = useContext(ApiClientContext);
  if (!ctx) {
    throw new Error('useApiMode doit être utilisé dans un <ApiClientProvider>.');
  }
  return ctx.mode;
}
