/**
 * @file        admin-dashboard.client.ts
 * @description Agrégateur **live** du tableau de bord admin (AD-01).
 *
 *              Il n'existe pas de service d'agrégation dédié (gap connu —
 *              Bloc D). Ce client compose donc UNIQUEMENT ce qui est réellement
 *              dérivable des services livrés (compteurs de corrections via les
 *              `total` paginés d'identity-service) et renvoie `null` pour tout
 *              le reste — contrat honnête, jamais de zéro inventé.
 *
 * @module      @nina-aes/api-client
 */

import type { AdminDashboardApi, CorrectionApi } from '../core/client.types';
import { AdminDashboardStatsSchema, type AdminDashboardStats } from './admin-dashboard.schema';

export class AdminDashboardClient implements AdminDashboardApi {
  /**
   * @param correction - Sous-client corrections (même transport authentifié) ;
   *                     seule source agrégable aujourd'hui.
   */
  constructor(private readonly correction: CorrectionApi) {}

  /**
   * Compose les statistiques du dashboard :
   *
   *  - `correctionsPending` : `total` de `GET /corrections?status=UNDER_REVIEW`
   *    (pageSize 1 — on ne lit que le compteur) ;
   *  - `correctionsToday`   : `total` de `GET /corrections?from=<aujourd'hui>` ;
   *  - toutes les autres sections : `null` (backend d'agrégation Bloc D non
   *    implémenté — séries temporelles, heatmaps, KPIs historisés, top agents,
   *    feed d'alertes).
   */
  async getStats(): Promise<AdminDashboardStats> {
    const today = new Date().toISOString().slice(0, 10);
    const [pending, submittedToday] = await Promise.all([
      this.correction.list({ status: 'UNDER_REVIEW', pageSize: 1 }),
      this.correction.list({ from: today, pageSize: 1 }),
    ]);

    return AdminDashboardStatsSchema.parse({
      correctionsPending: pending.total,
      correctionsToday: submittedToday.total,
      correctionsPerDay: null, // backend Bloc D non implémenté
      activityByRegion: null, // backend Bloc D non implémenté
      alertsByRegion: null, // backend Bloc D non implémenté
      kpis: null, // backend Bloc D non implémenté
      topAgents: null, // scoring intégrité SIGAC non branché (Bloc D)
      alerts: null, // flux temps réel (SSE audit/SIGAC) non implémenté
    });
  }
}
