/**
 * @file        sigac.schema.ts
 * @description Schémas Zod pour le signalement anonyme (SIGAC — Bloc D).
 *              **Aucune PII** dans les payloads : pas de nom, pas d'email,
 *              pas d'IP côté client (le proxy strippe les headers).
 * @module      @nina-aes/api-client
 */

import { z } from 'zod';

/** Catégories de fait signalé. */
export const AlertCategorySchema = z.enum([
  'BRIBERY',
  'FORGERY',
  'FAVORITISM',
  'ABUSE_OF_POWER',
  'PROCUREMENT',
  'OTHER',
]);

export const AlertSeveritySchema = z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/** Pièce jointe (URL signée MinIO). */
export const EvidenceAttachmentSchema = z.object({
  url: z.string().url(),
  filename: z.string().max(200),
  contentType: z.string().max(100),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
});

/** DTO d'envoi d'un signalement anonyme. */
export const AnonymousAlertDtoSchema = z.object({
  category: AlertCategorySchema,
  description: z.string().trim().min(50).max(8000),
  evidence: z.array(EvidenceAttachmentSchema).max(20).default([]),
  /** Localisation approximative (région / cercle) — pas le nom du fonctionnaire. */
  region: z.string().max(50).optional(),
  cercle: z.string().max(50).optional(),
});

/** Réponse après soumission : token opaque qui permet au lanceur d'alerte
 *  de suivre l'instruction sans s'identifier. À conserver précieusement. */
export const AnonymousAlertReceiptSchema = z.object({
  /** Token de suivi (format `vault:v<n>:<hash>`). */
  trackingToken: z.string().min(8).max(128),
  /** ID interne (utile pour l'auditeur, pas exposé au rapporteur). */
  alertId: z.string().uuid(),
  /** Sévérité estimée par le classifieur NLP. */
  estimatedSeverity: AlertSeveritySchema,
  /** Catégorie reclassée (peut différer du choix utilisateur). */
  classifiedCategory: AlertCategorySchema,
  /** Date de création (ISO 8601). */
  createdAt: z.string().datetime(),
});

/** Suivi d'une instruction via le token. Aucune PII exposée. */
export const AnonymousAlertStatusSchema = z.object({
  trackingToken: z.string(),
  status: z.enum(['RECEIVED', 'TRIAGED', 'INVESTIGATING', 'SUBSTANTIATED', 'DISMISSED', 'CLOSED']),
  publicNotes: z.array(
    z.object({
      date: z.string().datetime(),
      message: z.string().max(2000),
    }),
  ),
});

export type AlertCategory = z.infer<typeof AlertCategorySchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type EvidenceAttachment = z.infer<typeof EvidenceAttachmentSchema>;
export type AnonymousAlertDto = z.infer<typeof AnonymousAlertDtoSchema>;
export type AnonymousAlertReceipt = z.infer<typeof AnonymousAlertReceiptSchema>;
export type AnonymousAlertStatus = z.infer<typeof AnonymousAlertStatusSchema>;
