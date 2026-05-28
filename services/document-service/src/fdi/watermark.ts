/**
 * @file        watermark.ts
 * @description Helper qui calcule un watermark anti-fraude court non-PII
 *              imprimé en filigrane sur le PDF et inclus dans le claim `wm`
 *              du JWT QR. Permet de tracer une fuite ciblée d'un PDF sans
 *              exposer d'information personnelle dans le QR.
 *
 *              wm = 12 premiers chars de SHA-256(ip|userAgent|jti)
 *
 * @module      document-service/fdi
 */
import { createHash } from 'node:crypto';

export function computeWatermark(ip: string, userAgent: string, jti: string): string {
  return createHash('sha256').update(`${ip}|${userAgent}|${jti}`).digest('hex').slice(0, 12);
}
