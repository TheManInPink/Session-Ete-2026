/**
 * @file        cancelable.transform.spec.ts
 * @description Tests du CŒUR DE SÉCURITÉ (protection de template ISO/IEC 24745).
 *              Couvre les propriétés exigées par doc 25 §0 / ADR-025 :
 *                - DEUX captures du MÊME doigt (vecteurs proches) → distance ≤ τ
 *                  (matching flou préservé : c'est TOUT le point vs un hash) ;
 *                - DEUX doigts DIFFÉRENTS → distance > τ (pas de faux match) ;
 *                - IRRÉVERSIBILITÉ : le template protégé est un code signe ±1 (pas
 *                  d'image, pas de vecteur clair récupérable) ;
 *                - RÉVOCABILITÉ / NON-CHAÎNABILITÉ : deux kids différents
 *                  produisent deux templates protégés NON corrélés (le même doigt
 *                  avec deux paramètres ne se relie pas) → la rotation invalide
 *                  l'ancien template ;
 *                - ROTATION = re-projection COHÉRENTE : le même kid redonne
 *                  toujours le même code (déterministe) ;
 *                - distance de Hamming dans [0, 1], symétrique.
 * @module      biometric-service/test
 */
import { createHash } from 'node:crypto';
import {
  cancelableTransform,
  protectedDistance,
  scoreLeThreshold,
} from '../../src/cancelable/cancelable.transform.js';
import { normalizeFeatureVector } from '../../src/cancelable/feature-extractor.js';

const PROJ_DIM = 512;
const TAU = 0.32;

/** Paramètre cancelable de test (déterministe, hors Vault). */
function param(kid: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`test-cancelable|${kid}`).digest());
}

/** Vecteur de features pseudo-aléatoire déterministe (seed). */
function vector(seed: number, dim = 128): number[] {
  const v: number[] = [];
  let s = seed >>> 0;
  for (let i = 0; i < dim; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    v.push((s / 0xffffffff) * 2 - 1);
  }
  return v;
}

/** Ajoute un petit bruit (seconde capture du même doigt). */
function jitter(v: number[], amplitude: number, seed: number): number[] {
  let s = seed >>> 0;
  return v.map((x) => {
    s = (s * 1103515245 + 12345) >>> 0;
    return x + ((s / 0xffffffff) * 2 - 1) * amplitude;
  });
}

describe('cancelable transform (ISO/IEC 24745)', () => {
  it('DEUX captures du MÊME doigt (bruit léger) matchent : distance ≤ τ', () => {
    const kid = 'bio-transform-v1';
    const p = param(kid);
    const capture1 = normalizeFeatureVector(vector(42));
    const capture2 = normalizeFeatureVector(jitter(vector(42), 0.02, 7)); // même doigt, bruité

    const t1 = cancelableTransform(capture1, p, PROJ_DIM, kid);
    const t2 = cancelableTransform(capture2, p, PROJ_DIM, kid);
    const d = protectedDistance(t1, t2);

    expect(d).toBeLessThanOrEqual(TAU);
    expect(scoreLeThreshold(d, TAU)).toBe(true);
  });

  it('DEUX doigts DIFFÉRENTS ne matchent pas : distance > τ', () => {
    const kid = 'bio-transform-v1';
    const p = param(kid);
    const fingerA = normalizeFeatureVector(vector(1));
    const fingerB = normalizeFeatureVector(vector(999)); // autre doigt

    const tA = cancelableTransform(fingerA, p, PROJ_DIM, kid);
    const tB = cancelableTransform(fingerB, p, PROJ_DIM, kid);
    const d = protectedDistance(tA, tB);

    expect(d).toBeGreaterThan(TAU);
    expect(scoreLeThreshold(d, TAU)).toBe(false);
  });

  it('IRRÉVERSIBILITÉ : le template protégé est un code signe ±1 (aucune image/vecteur clair)', () => {
    const kid = 'bio-transform-v1';
    const t = cancelableTransform(normalizeFeatureVector(vector(5)), param(kid), PROJ_DIM, kid);
    expect(t.byteLength).toBe(PROJ_DIM);
    const codes = new Int8Array(t.buffer, t.byteOffset, t.length);
    for (const c of codes) {
      // Uniquement ±1 : pas d'amplitude → pas de reconstruction du vecteur source.
      expect(c === 1 || c === -1).toBe(true);
    }
  });

  it('ROTATION : le MÊME kid redonne TOUJOURS le même code (re-projection déterministe)', () => {
    const kid = 'bio-transform-v3';
    const v = normalizeFeatureVector(vector(77));
    const a = cancelableTransform(v, param(kid), PROJ_DIM, kid);
    const b = cancelableTransform(v, param(kid), PROJ_DIM, kid);
    expect(protectedDistance(a, b)).toBe(0); // identique → distance nulle
  });

  it('NON-CHAÎNABILITÉ / RÉVOCABILITÉ : deux kids différents → templates NON corrélés', () => {
    const v = normalizeFeatureVector(vector(77)); // MÊME doigt
    const oldKid = 'bio-transform-v1';
    const newKid = 'bio-transform-v2';
    const oldT = cancelableTransform(v, param(oldKid), PROJ_DIM, oldKid);
    const newT = cancelableTransform(v, param(newKid), PROJ_DIM, newKid);

    // Le même doigt sous deux paramètres ne se relie pas (≈ distance aléatoire),
    // donc l'ANCIEN template ne matche PAS le nouveau → rotation = révocation.
    const d = protectedDistance(oldT, newT);
    expect(d).toBeGreaterThan(TAU);
  });

  it('distance de Hamming : dans [0,1], symétrique, 1 si tailles incompatibles', () => {
    const kid = 'bio-transform-v1';
    const a = cancelableTransform(normalizeFeatureVector(vector(3)), param(kid), PROJ_DIM, kid);
    const b = cancelableTransform(normalizeFeatureVector(vector(8)), param(kid), PROJ_DIM, kid);
    const d = protectedDistance(a, b);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
    expect(protectedDistance(a, b)).toBe(protectedDistance(b, a)); // symétrie
    // Tailles différentes (kids/projDim incompatibles) → distance maximale.
    const shorter = cancelableTransform(normalizeFeatureVector(vector(3)), param(kid), 256, kid);
    expect(protectedDistance(a, shorter)).toBe(1);
  });
});

describe('feature extractor', () => {
  it('rejette un vecteur vide ou de norme nulle', () => {
    expect(() => normalizeFeatureVector([])).toThrow('FEATURE_VECTOR_EMPTY');
    expect(() => normalizeFeatureVector([0, 0, 0])).toThrow('FEATURE_VECTOR_ZERO_NORM');
  });

  it('L2-normalise (norme résultante ≈ 1)', () => {
    const out = normalizeFeatureVector([3, 4]); // norme 5 → [0.6, 0.8]
    const norm = Math.sqrt(out[0]! ** 2 + out[1]! ** 2);
    expect(norm).toBeCloseTo(1, 10);
  });
});
