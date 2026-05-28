/**
 * @file        qr-payload.interface.ts
 * @description Schéma du payload JWT RS256 encodé dans le QR de la FDI.
 *              Aligné docs/10 §7 + ADR-006 (Addendum 2026-05-25) + ADR-026.
 * @module      document-service/qr
 */

/** Identité minimisée lisible offline depuis le QR. */
export interface QrCitizenSummary {
  nina: string;
  firstName: string;
  lastName: string;
  birthDate: string; // ISO 8601 YYYY-MM-DD
  sex: 'M' | 'F' | 'U';
  birthPlace: string; // commune seule (PII minimisé)
}

/** Métadonnées du document FDI signées dans le JWT. */
export interface QrFdiSummary {
  serialNumber: string;
  type: 'FICHE_DESCRIPTIVE';
  language: string; // ISO 639-3 (fra | bam | snk | fuv)
  /**
   * SHA-256 hex du JSON canonique de l'ensemble des champs imprimés
   * (citoyen + serialNumber + langue + documentId + issuedAt).
   * Permet de détecter une altération visuelle du PDF (faux papier
   * avec QR authentique) à la vérification.
   */
  hash: string;
  issuedAt: string; // ISO 8601 lisible humain
  documentId: string;
}

/**
 * Payload JWT complet du QR de la FDI.
 * Signé RS256 par Vault Transit (clé `nina-qr-signing`).
 */
export interface QrPayload {
  // ─── claims JWT standards ───────────────────────────────────────
  iss: string; // "urn:nina-aes:ctdec-bamako"
  sub: string; // NINA
  jti: string; // UUID v7 — clé de révocation
  iat: number; // émission (epoch seconds)
  nbf: number; // not-before = iat
  exp: number; // expiry = iat + FDI_TTL_DAYS*86400
  aud: string[]; // ["urn:nina-aes:verifier"]

  // ─── extensions FDI ─────────────────────────────────────────────
  fdi: QrFdiSummary;
  citizen: QrCitizenSummary;
  /** Hash du template biométrique — placeholder null en P0 (Bloc F). */
  biometricHash: string | null;
  /** Watermark non-PII : 12 premiers chars de SHA-256(ip|userAgent|jti). */
  wm: string;
}

/** Résultat d'une vérification de QR par {@link QrVerifierService.verify}. */
export type QrVerifyResult =
  | {
      valid: true;
      jti: string;
      fdi: QrFdiSummary;
      citizen: QrCitizenSummary;
    }
  | {
      valid: false;
      reasonCode:
        | 'EXPIRED'
        | 'REVOKED'
        | 'BAD_SIGNATURE'
        | 'BAD_CLAIM'
        | 'HASH_MISMATCH'
        | 'INVALID';
    };
