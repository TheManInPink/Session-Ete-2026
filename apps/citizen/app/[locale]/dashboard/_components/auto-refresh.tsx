/**
 * @file        auto-refresh.tsx
 * @description Rafraîchit périodiquement les données du Server Component parent
 *              via `router.refresh()` (re-fetch RSC : ni rechargement de page,
 *              ni perte d'état client). Le tableau de bord PC-05 l'utilise pour
 *              refléter l'évolution du statut des corrections (UNDER_REVIEW →
 *              APPROVED/REJECTED) sans action manuelle du citoyen.
 *
 *              Économe en ressources : le minuteur est SUSPENDU quand l'onglet
 *              est masqué (`visibilitychange`) et un rafraîchissement immédiat a
 *              lieu au retour au premier plan (pas de requête serveur inutile en
 *              arrière-plan).
 *
 * @module      @nina-aes/citizen
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer === undefined) timer = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh(); // rattrapage immédiat au retour au premier plan
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
