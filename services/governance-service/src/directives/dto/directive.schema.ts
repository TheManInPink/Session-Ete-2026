/**
 * @file        directive.schema.ts
 * @description Schémas Zod des DTO du module Directives (Kanban). Validation
 *              stricte (`.strict()`).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/directives
 */
import { z } from 'zod';
import { SGOGT_PRIORITIES } from '../../sgogt/dto/sgogt.schema.js';

/** Colonnes Kanban (cycle de vie d'une directive). */
export const TASK_STATUSES = ['DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;

/** Corps de `POST /directives` — création d'une directive (DRAFT par défaut). */
export const createDirectiveSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(20_000),
    priority: z.enum(SGOGT_PRIORITIES).default('NORMAL'),
    /** Responsable de l'exécution (FK User.id). Optionnel à la création. */
    assigneeId: z.uuid().optional(),
    /** Échéance (ISO-8601 complet). */
    deadline: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export type CreateDirectiveDto = z.infer<typeof createDirectiveSchema>;

/** Corps de `POST /directives/:id/transition` — changement de colonne Kanban. */
export const transitionDirectiveSchema = z
  .object({
    /** Statut cible. */
    toStatus: z.enum(TASK_STATUSES),
    /** Note de transition (obligatoire pour un REJECTED). */
    note: z.string().trim().min(1).max(2000).optional(),
    /** Réassignation éventuelle (FK User.id). */
    assigneeId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => v.toStatus !== 'REJECTED' || (v.note && v.note.length > 0), {
    message: 'note est requise pour un rejet (REJECTED)',
    path: ['note'],
  });

export type TransitionDirectiveDto = z.infer<typeof transitionDirectiveSchema>;
