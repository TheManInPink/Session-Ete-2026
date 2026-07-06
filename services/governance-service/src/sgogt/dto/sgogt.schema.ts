/**
 * @file        sgogt.schema.ts
 * @description Schémas Zod des DTO du module SGOGT (messagerie officielle signée).
 *              Validation stricte (`.strict()` rejette toute clé inconnue) —
 *              complément du `ValidationPipe` global.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/sgogt
 */
import { z } from 'zod';

/** Classifications d'urgence (pilotent le TTL d'escalade). */
export const SGOGT_PRIORITIES = ['NORMAL', 'HIGH', 'CRITICAL'] as const;

/**
 * Corps de `POST /sgogt/messages` — émission d'un message officiel signé.
 * Le `body` n'est PAS signé brut : c'est son SHA-256 (`bodyHash`) qui entre dans
 * les claims (compacité du JWS). `threadId` est optionnel (généré sinon) et est
 * couvert par la signature.
 */
export const sendMessageSchema = z
  .object({
    /** Destinataire (FK User.id, UUID). */
    recipientId: z.uuid(),
    /** Objet de la décision. */
    subject: z.string().trim().min(1).max(300),
    /** Corps (décision). Signé via son SHA-256, jamais brut. */
    body: z.string().trim().min(1).max(20_000),
    /** Classification d'urgence (défaut NORMAL). */
    priority: z.enum(SGOGT_PRIORITIES).default('NORMAL'),
    /** Fil de discussion existant (UUID) — sinon un nouveau fil est créé. */
    threadId: z.uuid().optional(),
  })
  .strict();

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

/**
 * Corps de `POST /sgogt/messages/:id/respond` — réponse à un message (clôt la
 * boucle de la décision : statut RESPONDED).
 */
export const respondMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000),
  })
  .strict();

export type RespondMessageDto = z.infer<typeof respondMessageSchema>;
