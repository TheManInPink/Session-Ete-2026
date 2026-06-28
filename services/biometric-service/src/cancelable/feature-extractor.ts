/**
 * @file        feature-extractor.ts
 * @description Extraction du VECTEUR DE CARACTÉRISTIQUES à partir du template ISO
 *              fourni (minuties ISO/IEC 19794-2 pour l'empreinte, embedding ONNX
 *              pour le visage). Dans le pipeline cible (doc 25 §4.2), OpenCV 5 +
 *              ONNX Runtime produisent ce vecteur à partir de l'image brute en RAM
 *              verrouillée ; l'IMAGE ne quitte JAMAIS le capteur/RAM (tmpfs/mlock,
 *              §4.4) et n'arrive jamais ici.
 *
 *              Dans CE service NestJS, l'extraction lourde (OpenCV/ONNX) est
 *              déportée côté capture (borne Electron / kit agent) ; le service
 *              reçoit un VECTEUR de features normalisées (déjà extrait, image
 *              jamais transmise). Cette fonction se contente de :
 *                - parser le vecteur reçu (float) ;
 *                - le L2-normaliser (la métrique de distance protégée suppose des
 *                  features comparables d'une capture à l'autre).
 *
 *              ⚠️  On ne stocke ni ne journalise JAMAIS ce vecteur clair : il est
 *              transformé immédiatement en template protégé (cancelable) puis
 *              effacé best-effort (cf. `secure-buffer.ts`).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/cancelable
 */

/**
 * Convertit un vecteur de caractéristiques reçu (nombres) en `Float64Array`
 * L2-normalisé, prêt pour la projection cancelable. La L2-normalisation rend les
 * deux captures comparables (la distance protégée suppose des amplitudes
 * homogènes) ; un vecteur nul est rejeté (capture invalide).
 *
 * @param raw Vecteur de caractéristiques (déjà extrait côté capture).
 * @returns Vecteur L2-normalisé.
 * @throws Error si le vecteur est vide ou de norme nulle (capture invalide).
 */
export function normalizeFeatureVector(raw: readonly number[]): Float64Array {
  if (raw.length === 0) {
    throw new Error('FEATURE_VECTOR_EMPTY');
  }
  let sumSq = 0;
  for (const x of raw) {
    if (!Number.isFinite(x)) throw new Error('FEATURE_VECTOR_NON_FINITE');
    sumSq += x * x;
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) throw new Error('FEATURE_VECTOR_ZERO_NORM');

  const out = new Float64Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw[i]! / norm;
  }
  return out;
}
