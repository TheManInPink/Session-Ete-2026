/**
 * @file        consent.schema.ts
 * @description Schémas Zod des DTO du module Consentement. Validation stricte
 *              (`.strict()` rejette toute clé inconnue). Le JWS lui-même est
 *              vérifié cryptographiquement par `ConsentVerifier` (pas seulement
 *              par la forme).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/consent
 */
import { z } from 'zod';

/** Forme compacte d'un JWS (`header.payload.signature` en base64url). */
const jwsCompact = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    'consent_jws doit être un JWS compact',
  );

/**
 * Corps de `POST /biometric/consent/verify` — enregistre une preuve de
 * consentement déjà signée par le citoyen (vérifiée contre sa clé ancrée).
 */
export const verifyConsentSchema = z
  .object({
    /** Citoyen ciblé (UUID). Anti-IDOR : doit == `sub` du JWS. */
    citizenId: z.uuid(),
    /** JWS Ed25519 de consentement signé par le citoyen. */
    consentJws: jwsCompact,
    /** URL MinIO chiffrée de la preuve (optionnelle ; jamais le JWS brut côté objet). */
    consentDocUrl: z.string().url().max(500).optional(),
  })
  .strict();

export type VerifyConsentDto = z.infer<typeof verifyConsentSchema>;

/**
 * Corps de `POST /biometric/consent/revoke` — retrait du consentement (déclenche
 * le droit à l'effacement des templates associés).
 */
export const revokeConsentSchema = z
  .object({
    /** Citoyen concerné (UUID). */
    citizenId: z.uuid(),
    /** Motif tracé (audit). */
    reason: z.string().trim().min(1).max(200),
  })
  .strict();

export type RevokeConsentDto = z.infer<typeof revokeConsentSchema>;
