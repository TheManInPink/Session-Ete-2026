/**
 * @file        admin-dashboard.schema.ts
 * @description Schémas Zod du tableau de bord admin (AD-01 / AD-03).
 *
 *              CONTRAT HONNÊTE : il n'existe AUCUN backend d'agrégation pour
 *              ces indicateurs (gap connu — Bloc D). Chaque section est donc
 *              **nullable** : `null` = « source indisponible », jamais un zéro
 *              menteur. En mode live, seuls les compteurs dérivables des
 *              services existants sont remplis (cf. `AdminDashboardClient`).
 *
 *              Les shapes sont calés sur les DONNÉES consommées par
 *              `apps/admin/lib/mock-dashboard.ts` (KpiSnapshot,
 *              CORRECTIONS_PER_DAY, ACTIVITY_BY_REGION, INITIAL_ALERTS) — sans
 *              les concerns de vue (`tone`, `drillTo`, `label`) qui restent
 *              dans l'app.
 *
 * @module      @nina-aes/api-client
 */

import { z } from 'zod';
import { AlertCategorySchema, AlertSeveritySchema } from '../sigac/sigac.schema';

/** Indicateurs suivis par les cartes KPI d'AD-01. */
export const AdminKpiKeySchema = z.enum([
  'ninaActive',
  'correctionsPending',
  'alertsOpen',
  'appointmentsToday',
]);

/** Instantané d'un KPI : valeur du jour + variation + sparkline 30 jours. */
export const AdminKpiSnapshotSchema = z.object({
  key: AdminKpiKeySchema,
  /** Valeur affichée. */
  value: z.number(),
  /** Variation depuis la semaine précédente (% signé). */
  weekDelta: z.number(),
  /** 30 derniers jours pour la sparkline. */
  history: z.array(z.number()),
});

/** Point de la série corrections/jour (dates ISO `YYYY-MM-DD`). */
export const DailyCorrectionCountSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
});

/** Valeur d'activité par région (heatmap Mali, codes ISO `ML-xx`). */
export const RegionActivitySchema = z.object({
  regionCode: z.string().min(1),
  value: z.number().nonnegative(),
});

/** Agent du top intégrité (AD-03) — score de bande ADR-023. */
export const AgentIntegritySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  score: z.number().min(0).max(100),
  centerCode: z.string(),
  matricule: z.string(),
});

/** Entrée du feed d'alertes SIGAC (AD-01 + AD-03) — côté données uniquement. */
export const AlertEntrySchema = z.object({
  id: z.string().min(1),
  severity: AlertSeveritySchema,
  category: AlertCategorySchema,
  shortDescription: z.string(),
  location: z.string(),
  /** ISO 8601. */
  receivedAt: z.iso.datetime(),
});

/**
 * Statistiques agrégées du dashboard admin. CHAQUE section vaut `null` quand
 * aucune source backend n'existe (Bloc D non implémenté) — l'UI doit afficher
 * un état « indisponible », pas un zéro.
 */
export const AdminDashboardStatsSchema = z.object({
  /** Corrections en attente (`UNDER_REVIEW`). Dérivable en live via corrections. */
  correctionsPending: z.number().int().nonnegative().nullable(),
  /** Corrections soumises aujourd'hui. Dérivable en live via corrections. */
  correctionsToday: z.number().int().nonnegative().nullable(),
  /** Série corrections/jour sur 30 jours. `null` : agrégation Bloc D absente. */
  correctionsPerDay: z.array(DailyCorrectionCountSchema).nullable(),
  /** Corrections traitées par région (30 j). `null` : agrégation Bloc D absente. */
  activityByRegion: z.array(RegionActivitySchema).nullable(),
  /** Alertes SIGAC actives par région. `null` : agrégation Bloc D absente. */
  alertsByRegion: z.array(RegionActivitySchema).nullable(),
  /** KPIs + historiques 30 j par indicateur. `null` : agrégation Bloc D absente. */
  kpis: z.array(AdminKpiSnapshotSchema).nullable(),
  /** Top agents intégrité (AD-03). `null` : scoring SIGAC non branché. */
  topAgents: z.array(AgentIntegritySchema).nullable(),
  /** Feed d'alertes (AlertEntry). `null` : flux temps réel (SSE) non implémenté. */
  alerts: z.array(AlertEntrySchema).nullable(),
});

export type AdminKpiKey = z.infer<typeof AdminKpiKeySchema>;
export type AdminKpiSnapshot = z.infer<typeof AdminKpiSnapshotSchema>;
export type DailyCorrectionCount = z.infer<typeof DailyCorrectionCountSchema>;
export type RegionActivity = z.infer<typeof RegionActivitySchema>;
export type AgentIntegrity = z.infer<typeof AgentIntegritySchema>;
export type AlertEntry = z.infer<typeof AlertEntrySchema>;
export type AdminDashboardStats = z.infer<typeof AdminDashboardStatsSchema>;
