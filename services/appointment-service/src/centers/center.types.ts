/**
 * @file        center.types.ts
 * @description Types du domaine « centre d'enrôlement ». Découplés de Prisma :
 *              le repository projette les lignes `EnrollmentCenter` (+ Institution
 *              + Location) vers ces formes applicatives.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import type { DayKey } from '../common/time.util.js';

/**
 * Catalogue des services offerts à un guichet. Aligné sur le vocabulaire RAVEC ;
 * étendu au besoin (la colonne DB est un `text[]` libre, mais on valide en
 * entrée contre cette liste).
 */
export const CENTER_SERVICES = [
  'ENROLLMENT', // Enrôlement biométrique / création NINA
  'CORRECTION', // Correction d'une fiche existante
  'DOCUMENT_PICKUP', // Retrait d'un document (FDI, extrait)
  'RENEWAL', // Renouvellement
  'INFO', // Renseignements
] as const;
export type CenterService = (typeof CENTER_SERVICES)[number];

/** Nature d'un créneau. */
export type SlotKind = 'STANDARD' | 'PRIORITY';

/**
 * Horaires d'ouverture : pour chaque jour, un couple `[ouverture, fermeture]`
 * en "HH:mm", ou `null`/absent si fermé. Plage continue (pas de pause méridienne
 * modélisée en V1 — à enrichir si nécessaire).
 */
export type OpeningHours = Partial<Record<DayKey, [string, string] | null>>;

/**
 * Configuration opérationnelle minimale nécessaire au calcul de créneaux.
 * Sous-ensemble pur (sans dépendance Prisma) de `EnrollmentCenter`, pour rendre
 * `slots.util` testable en isolation.
 */
export interface CenterSlotConfig {
  slotDurationMin: number;
  parallelDesks: number;
  capacityPerDay: number;
  standardQuota: number;
  priorityQuota: number;
  /** Bornes de la fenêtre prioritaire, en minutes depuis minuit. */
  priorityFromMin: number;
  priorityToMin: number;
  openingHours: OpeningHours;
}

/** Occupation observée d'une journée (comptes de RDV actifs). */
export interface DayOccupancy {
  /** ISO du début de créneau → nombre de RDV actifs sur ce créneau. */
  perSlot: Map<string, number>;
  /** Total de RDV actifs en créneau STANDARD ce jour. */
  standardCount: number;
  /** Total de RDV actifs en créneau PRIORITAIRE ce jour. */
  priorityCount: number;
  /** Total de RDV actifs (toutes natures) ce jour. */
  total: number;
}

/** Centre projeté (résumé) — pour la liste / recherche. */
export interface CenterSummary {
  /** Identifiant public du centre = `Institution.id` (= `centerId` des RDV). */
  id: string;
  code: string;
  name: string;
  type: string;
  address: string | null;
  phoneNumber: string | null;
  /** Code administratif du rattachement immédiat (ex. "ML-02-04"). */
  locationCode: string | null;
  /** Code région dérivé (2 premiers segments, ex. "ML-02"). */
  regionCode: string | null;
  regionName: string | null;
  /** Code cercle dérivé (3 premiers segments, ex. "ML-02-04"). */
  cercleCode: string | null;
  cercleName: string | null;
  latitude: number;
  longitude: number;
  servicesOffered: string[];
  isActive: boolean;
  /** Ouvert à l'instant de la requête (selon `openingHours`). */
  openNow: boolean;
  /** Distance au point demandé (km), présente uniquement en recherche géo. */
  distanceKm?: number;
}

/** Centre projeté (détail) — pour `GET /centers/:id`. */
export interface CenterDetail extends CenterSummary {
  capacityPerDay: number;
  slotDurationMin: number;
  parallelDesks: number;
  standardQuota: number;
  priorityQuota: number;
  priorityWindow: { from: string; to: string };
  openingHours: OpeningHours;
  timezone: string;
}

/** Un créneau calculé avec sa disponibilité. */
export interface AvailabilitySlot {
  /** Début du créneau (ISO 8601 UTC). */
  start: string;
  kind: SlotKind;
  /** Places offertes sur ce créneau (= guichets parallèles). */
  capacity: number;
  /** Places déjà réservées. */
  booked: number;
  /** Places restantes (≥ 0). */
  remaining: number;
}

/** Disponibilités d'une journée. */
export interface DayAvailability {
  date: string;
  open: boolean;
  slots: AvailabilitySlot[];
  /** Récapitulatif quotas du jour. */
  summary: {
    standardRemaining: number;
    priorityRemaining: number;
    capacityRemaining: number;
  };
}
