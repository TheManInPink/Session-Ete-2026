/**
 * @file        verify.schema.ts
 * @description Schémas Zod des DTO de vérification 1:1 et d'identification 1:N.
 *              Validation stricte. Le `reason` (motif tracé) est OBLIGATOIRE :
 *              un agent ne vérifie/identifie pas un citoyen sans raison (anti-IDOR
 *              + auditabilité, doc 25 §4.2).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/verify
 */
import { z } from 'zod';

const featureVector = z
  .array(z.number().finite())
  .min(8, 'vecteur de features trop court')
  .max(4096, 'vecteur de features trop long');

/** Corps de `POST /biometric/verify/fingerprint` — vérification 1:1 (distance ≤ τ). */
export const verifyFingerprintSchema = z
  .object({
    /** Citoyen présentant son NINA (UUID). */
    citizenId: z.uuid(),
    /** Vecteur de features de la NOUVELLE capture (jamais l'image). */
    featureVector,
    /** Motif de la vérification (tracé — anti-IDOR + audit). */
    reason: z.string().trim().min(1).max(200),
  })
  .strict();

export type VerifyFingerprintDto = z.infer<typeof verifyFingerprintSchema>;

/**
 * Corps de `POST /biometric/identify/fingerprint` — recherche 1:N restreinte
 * (P3c). Accès `inspector` + mandat. Le `mandateRef` est OBLIGATOIRE (4-yeux).
 */
export const identifyFingerprintSchema = z
  .object({
    /** Vecteur de features de la sonde (jamais l'image). */
    featureVector,
    /** Référence du mandat judiciaire / enquête OCLEI (tracé — 4-yeux). */
    mandateRef: z.string().trim().min(1).max(200),
    /** Nombre maximal de candidats renvoyés (borne). */
    topK: z.coerce.number().int().min(1).max(50).default(5),
  })
  .strict();

export type IdentifyFingerprintDto = z.infer<typeof identifyFingerprintSchema>;
