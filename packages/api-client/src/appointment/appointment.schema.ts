/**
 * @file        appointment.schema.ts
 * @description Schémas Zod pour les rendez-vous CTDEC / antennes mobiles RAVEC.
 * @module      @nina-aes/api-client
 */

import { z } from 'zod';

export const AppointmentStatusSchema = z.enum([
  'REQUESTED',
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

export const PriorityLevelSchema = z.enum(['P1', 'P2', 'P3']);

/**
 * Résumé d'un centre d'enrôlement (CTDEC / antenne RAVEC) pour le sélecteur PC-04.
 * Aligné sur `CenterSummary` d'`appointment-service` (`GET /api/v1/centers`) : les
 * clés supplémentaires renvoyées par le backend (coords, distanceKm, openNow…)
 * sont ignorées au parse (schéma non `strict`).
 */
export const CenterSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  /** Type de centre (ex. `CTDEC`, `ANTENNE_RAVEC`). */
  type: z.string(),
  address: z.string().nullable().optional(),
  regionCode: z.string().nullable(),
  regionName: z.string().nullable(),
  cercleName: z.string().nullable().optional(),
  servicesOffered: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

/** Liste de centres (réponse de `GET /api/v1/centers`). */
export const CentersListSchema = z.array(CenterSummarySchema);

/**
 * Nature d'un créneau — binaire, alignée sur `SlotKind` d'appointment-service.
 * Le niveau P1/P2/P3 d'un RDV est décidé À LA RÉSERVATION selon la vulnérabilité :
 * il n'existe donc PAS au stade de la disponibilité.
 */
export const SlotKindSchema = z.enum(['STANDARD', 'PRIORITY']);

/**
 * Un créneau de disponibilité tel que renvoyé par
 * `GET /api/v1/centers/:id/availability` — aligné sur `AvailabilitySlot`
 * d'appointment-service. Données RÉELLES, non fabriquées : `capacity`/`booked`/
 * `remaining` viennent du serveur ; il n'y a NI numéro de file (attribué au
 * check-in) NI niveau P1/P2/P3 à ce stade.
 */
export const AvailabilitySlotSchema = z.object({
  /** Début du créneau (ISO 8601 UTC). */
  start: z.iso.datetime(),
  kind: SlotKindSchema,
  /** Places offertes sur ce créneau (= guichets parallèles). */
  capacity: z.number().int().nonnegative(),
  /** Places déjà réservées. */
  booked: z.number().int().nonnegative(),
  /** Places restantes (≥ 0). */
  remaining: z.number().int().nonnegative(),
});

/** Disponibilités d'une journée (créneaux + récapitulatif des quotas). */
export const DayAvailabilitySchema = z.object({
  /** Jour `YYYY-MM-DD` (clé de jour UTC côté serveur). */
  date: z.string(),
  open: z.boolean(),
  slots: z.array(AvailabilitySlotSchema),
  summary: z.object({
    standardRemaining: z.number().int().nonnegative(),
    priorityRemaining: z.number().int().nonnegative(),
    capacityRemaining: z.number().int().nonnegative(),
  }),
});

/** Réponse de `GET /api/v1/centers/:id/availability`. */
export const CenterAvailabilitySchema = z.object({
  centerId: z.uuid(),
  days: z.array(DayAvailabilitySchema),
});

/** Rendez-vous existant. */
export const AppointmentSchema = z.object({
  id: z.uuid(),
  citizenId: z.uuid(),
  centerId: z.uuid(),
  centerName: z.string(),
  status: AppointmentStatusSchema,
  priority: PriorityLevelSchema,
  /**
   * Numéro de passage — `null` tant que le citoyen n'a pas fait son check-in au
   * centre (assigné à l'arrivée, PAS à la réservation). Aligné sur
   * `AppointmentView.queueNumber` d'appointment-service (`number | null`).
   */
  queueNumber: z.number().int().positive().nullable(),
  scheduledAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

/**
 * DTO de prise de rendez-vous en self-service citoyen (`POST /appointments/me`).
 * Le `citizenId` n'y figure JAMAIS : l'identité est dérivée du NINA du token côté
 * serveur (anti-IDOR). Aligné sur `CreateSelfAppointmentDto` d'appointment-service
 * (`slot` ISO 8601, `reason` non vide ≤ 100).
 */
export const CreateAppointmentDtoSchema = z.object({
  centerId: z.uuid(),
  slot: z.iso.datetime(),
  reason: z.string().trim().min(5).max(100),
});

/**
 * Réponse paginée de `GET /appointments/me` — alignée sur `list()`
 * d'appointment-service (`{ page, pageSize, items }`, sans total agrégé).
 */
export const AppointmentListSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  items: z.array(AppointmentSchema),
});

export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;
export type CenterSummary = z.infer<typeof CenterSummarySchema>;
export type SlotKind = z.infer<typeof SlotKindSchema>;
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;
export type DayAvailability = z.infer<typeof DayAvailabilitySchema>;
export type CenterAvailability = z.infer<typeof CenterAvailabilitySchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type CreateAppointmentDto = z.infer<typeof CreateAppointmentDtoSchema>;
export type AppointmentList = z.infer<typeof AppointmentListSchema>;
