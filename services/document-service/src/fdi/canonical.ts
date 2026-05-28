/**
 * @file        canonical.ts
 * @description Sérialisation JSON canonique : tri stable des clés (récursif),
 *              élimination des `undefined`. Suit l'esprit de RFC 8785 sans
 *              les subtilités unicode (suffisant pour notre périmètre,
 *              valeurs alphanumériques + ASCII).
 *
 *              Utilisé pour produire `fdi.hash` au QR signing (phase 4 + 8)
 *              et le recalculer côté verifier (phase 4).
 *
 * @module      document-service/fdi
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const child = (v as Record<string, unknown>)[k];
      if (child !== undefined) out[k] = sortKeys(child);
    }
    return out;
  }
  return v;
}
