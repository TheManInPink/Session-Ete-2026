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
  regionCode: z.string(),
  regionName: z.string(),
  cercleName: z.string().nullable().optional(),
  servicesOffered: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

/** Liste de centres (réponse de `GET /api/v1/centers`). */
export const CentersListSchema = z.array(CenterSummarySchema);

/** Créneau disponible côté serveur. */
export const SlotSchema = z.object({
  startsAt: z.iso.datetime(),
  centerId: z.uuid(),
  centerName: z.string(),
  priority: PriorityLevelSchema,
  queueNumber: z.number().int().positive(),
});

/** Rendez-vous existant. */
export const AppointmentSchema = z.object({
  id: z.uuid(),
  citizenId: z.uuid(),
  centerId: z.uuid(),
  centerName: z.string(),
  status: AppointmentStatusSchema,
  priority: PriorityLevelSchema,
  queueNumber: z.number().int().positive(),
  scheduledAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

/** DTO de prise de rendez-vous. */
export const CreateAppointmentDtoSchema = z.object({
  centerId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  reason: z.string().trim().min(5).max(500),
});

export const SlotsListSchema = z.object({
  slots: z.array(SlotSchema),
});

export const AppointmentListSchema = z.object({
  items: z.array(AppointmentSchema),
  total: z.number().int().nonnegative(),
});

export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;
export type CenterSummary = z.infer<typeof CenterSummarySchema>;
export type Slot = z.infer<typeof SlotSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type CreateAppointmentDto = z.infer<typeof CreateAppointmentDtoSchema>;
export type SlotsList = z.infer<typeof SlotsListSchema>;
export type AppointmentList = z.infer<typeof AppointmentListSchema>;
