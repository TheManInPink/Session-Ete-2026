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

/** Créneau disponible côté serveur. */
export const SlotSchema = z.object({
  startsAt: z.string().datetime(),
  centerId: z.string().uuid(),
  centerName: z.string(),
  priority: PriorityLevelSchema,
  queueNumber: z.number().int().positive(),
});

/** Rendez-vous existant. */
export const AppointmentSchema = z.object({
  id: z.string().uuid(),
  citizenId: z.string().uuid(),
  centerId: z.string().uuid(),
  centerName: z.string(),
  status: AppointmentStatusSchema,
  priority: PriorityLevelSchema,
  queueNumber: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});

/** DTO de prise de rendez-vous. */
export const CreateAppointmentDtoSchema = z.object({
  centerId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
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
export type Slot = z.infer<typeof SlotSchema>;
export type Appointment = z.infer<typeof AppointmentSchema>;
export type CreateAppointmentDto = z.infer<typeof CreateAppointmentDtoSchema>;
export type SlotsList = z.infer<typeof SlotsListSchema>;
export type AppointmentList = z.infer<typeof AppointmentListSchema>;
