/**
 * @file        enroll.schema.ts
 * @description Schémas Zod des DTO d'enrôlement biométrique. Validation stricte.
 *
 *              ⚠️  Le service reçoit un VECTEUR DE CARACTÉRISTIQUES déjà extrait
 *              côté capture (borne Electron / kit agent, OpenCV/ONNX), JAMAIS
 *              l'image brute (qui ne quitte jamais la RAM verrouillée du poste de
 *              capture, doc 25 §4.4). Le vecteur clair est transformé immédiatement
 *              en template protégé puis effacé (best-effort).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/enrollment
 */
import { z } from 'zod';

/** Borne de longueur du vecteur de features (anti-amplification mémoire). */
// NB : en Zod 4, z.number() rejette déjà NaN/±Infinity (.finite() est un no-op déprécié).
const featureVector = z
  .array(z.number())
  .min(8, 'vecteur de features trop court')
  .max(4096, 'vecteur de features trop long');

/**
 * Corps de `POST /biometric/enrollment/fingerprint` — enrôle une empreinte. On
 * stocke UNIQUEMENT un template protégé (cancelable), jamais le vecteur clair.
 */
export const enrollFingerprintSchema = z
  .object({
    /** Citoyen concerné (UUID). Anti-IDOR : lié au consentement ancré. */
    citizenId: z.uuid(),
    /** Vecteur de caractéristiques extrait de l'empreinte (ISO 19794-2 → features). */
    featureVector,
    /** Format du template source (traçabilité ; défaut ISO standard). */
    templateFormat: z.string().trim().max(60).default('ISO/IEC 19794-2 v2'),
  })
  .strict();

export type EnrollFingerprintDto = z.infer<typeof enrollFingerprintSchema>;

/**
 * Corps de `POST /biometric/enrollment/face` — enrôle un visage (P3b). Embedding
 * facial déjà extrait (ArcFace/FaceNet ONNX), JAMAIS l'image.
 */
export const enrollFaceSchema = z
  .object({
    citizenId: z.uuid(),
    /** Embedding facial (vecteur de features) — jamais l'embedding brut stocké. */
    featureVector,
    templateFormat: z.string().trim().max(60).default('ISO/IEC 19794-5 v2'),
  })
  .strict();

export type EnrollFaceDto = z.infer<typeof enrollFaceSchema>;
