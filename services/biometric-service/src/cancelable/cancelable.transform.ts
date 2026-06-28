/**
 * @file        cancelable.transform.ts
 * @description CŒUR DE SÉCURITÉ — protection de template ISO/IEC 24745 par
 *              « cancelable biometrics » (projection aléatoire signée façon
 *              BioHashing). Remplace l'ancien schéma « HMAC + égalité stricte »
 *              (rejeté en doc 25 §0 : l'effet d'avalanche d'un hash DÉTRUIT la
 *              distance → FRR = 100 %, aucun match possible).
 *
 *              OBJECTIF — transformer un vecteur de caractéristiques biométriques
 *              en un TEMPLATE PROTÉGÉ qui est :
 *                (a) IRRÉVERSIBLE   — `R` réduit la dimension (PROJ_DIM peut être
 *                    < dim(v)) ET la binarisation `sign(R·v)` jette l'amplitude :
 *                    on ne reconstruit pas la biométrie.
 *                (b) RÉVOCABLE      — `R` est semée par le PARAMÈTRE cancelable
 *                    (secret Vault, versionné par `kid`). Changer le paramètre =
 *                    nouvelle `R` = nouveau template ; l'ancien devient inutilisable
 *                    (rotation double-écriture, doc 25 §4.5).
 *                (c) DISTANCE-PRÉSERVANTE — par le lemme de Johnson-Lindenstrauss,
 *                    une projection aléatoire conserve APPROXIMATIVEMENT les
 *                    distances → deux captures proches restent proches APRÈS
 *                    transformation. C'est TOUT le point vs un hash (doc 25 §0.4).
 *
 *              La comparaison se fait par DISTANCE DE HAMMING normalisée sur les
 *              codes signe + seuil τ (`distance ≤ τ`), JAMAIS par égalité.
 *
 *              ⚠️  HONNÊTETÉ (doc 25 §0.7, §4.3) : implémentation pédagogique. Une
 *              mise en production EXIGE une étude FAR/FRR mesurée sur la courbe DET
 *              + une analyse de résistance aux attaques par inversion (ART). Le
 *              `PROJ_DIM`, le seuil τ et la métrique sont figés à l'enrôlement
 *              (auditabilité du point d'opération).
 *
 *              ⚠️  Ce module NE LIT PAS Vault : il reçoit le PARAMÈTRE déjà
 *              résolu (octets) en argument et le garde le moins longtemps possible
 *              en RAM. La résolution Vault + cache vit dans `CancelableService`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/cancelable
 */
import { createHash } from 'node:crypto';

/**
 * PRNG déterministe (xoshiro-like via SplitMix64) semé par le paramètre secret.
 * Node n'expose pas de RNG gaussien semable ; on dérive donc nos propres tirages
 * de façon REPRODUCTIBLE (même seed → même matrice `R`) — indispensable pour que
 * l'enrôlement et la vérification d'un même `kid` produisent la MÊME projection.
 */
class SeededRng {
  private state: bigint;
  private static readonly MASK = (1n << 64n) - 1n;

  constructor(seed: bigint) {
    this.state = seed & SeededRng.MASK;
  }

  /** Prochain entier 64 bits non signé (SplitMix64). */
  private nextU64(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & SeededRng.MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & SeededRng.MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & SeededRng.MASK;
    return (z ^ (z >> 31n)) & SeededRng.MASK;
  }

  /** Réel uniforme dans [0, 1) (53 bits de mantisse). */
  nextFloat(): number {
    return Number(this.nextU64() >> 11n) / 2 ** 53;
  }

  /**
   * Tirage gaussien centré réduit via Box-Muller (composante cosinus). Suffisant
   * pour une matrice de projection aléatoire (Johnson-Lindenstrauss).
   */
  nextGaussian(): number {
    // u1 ∈ (0,1] pour éviter log(0).
    const u1 = 1 - this.nextFloat();
    const u2 = this.nextFloat();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Dérive une graine 64 bits du paramètre secret + d'un domaine (`kid`/usage).
 * On NE manipule jamais le paramètre brut au-delà de cette dérivation : la graine
 * ne permet pas de remonter au secret (pré-image SHA-256).
 *
 * @param param   Octets du paramètre cancelable (secret Vault).
 * @param domain  Domaine de séparation (ex. `transform_kid`) — anti-réutilisation.
 */
function deriveSeed(param: Uint8Array, domain: string): bigint {
  const digest = createHash('sha256')
    .update(param)
    .update('|randproj-seed|')
    .update(domain, 'utf8')
    .digest();
  // 8 premiers octets en little-endian → bigint 64 bits.
  let seed = 0n;
  for (let i = 7; i >= 0; i--) {
    seed = (seed << 8n) | BigInt(digest[i]!);
  }
  return seed;
}

/**
 * Applique la projection aléatoire cancelable au vecteur de caractéristiques.
 *
 * `p = sign(R · v)` où `R ∈ R^{projDim × dim(v)}` est semée par `param` (+domaine).
 * Le résultat est un code SIGNE binarisé (`int8` ∈ {-1, +1}) robuste au bruit,
 * sérialisé en octets opaques (stocké tel quel en `bytea`).
 *
 * @param features  Vecteur de caractéristiques (float32) extrait du template ISO.
 * @param param     Octets du paramètre cancelable (secret Vault) — éphémère.
 * @param projDim   Dimension de la projection (longueur du code signe).
 * @param domain    Domaine de séparation (le `transform_kid`).
 * @returns Octets du template protégé (code signe `int8`).
 */
export function cancelableTransform(
  features: Float64Array,
  param: Uint8Array,
  projDim: number,
  domain: string,
): Uint8Array {
  const dim = features.length;
  const rng = new SeededRng(deriveSeed(param, domain));
  const out = new Int8Array(projDim);

  // On génère `R` ligne par ligne pour ne JAMAIS matérialiser une matrice
  // projDim×dim complète en mémoire (économie + moins de surface sensible).
  for (let r = 0; r < projDim; r++) {
    let acc = 0;
    for (let c = 0; c < dim; c++) {
      acc += rng.nextGaussian() * features[c]!;
    }
    // sign(0) traité comme +1 (déterministe, sans branche dépendant du secret).
    out[r] = acc >= 0 ? 1 : -1;
  }
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * Distance de Hamming NORMALISÉE entre deux templates protégés (codes signe).
 *
 * ⚠️  ANTI-TIMING (doc 25 §4.3) : la boucle parcourt TOUTE la longueur sans
 * court-circuit (pas de `break`/`return` anticipé dépendant des octets comparés).
 * La vraie propriété anti-corrélation du système est l'ABSENCE de court-circuit
 * — ici dans cette boucle ET dans la boucle multi-templates de `verify`. Ce n'est
 * PAS un comparateur « temps constant » (les codes signe ne sont pas des octets
 * secrets : ils sont dérivés via le paramètre Vault, jamais le template clair).
 *
 * @param a Template protégé A (octets `int8`).
 * @param b Template protégé B (octets `int8`).
 * @returns Fraction de positions différentes dans [0, 1] (ou 1 si tailles ≠).
 */
export function protectedDistance(a: Uint8Array, b: Uint8Array): number {
  // Tailles différentes = kids/projDim incompatibles → distance maximale (1),
  // jamais un match. On NE court-circuite PAS sur le CONTENU, seulement sur une
  // incompatibilité structurelle publique (longueur).
  if (a.length !== b.length || a.length === 0) return 1;
  const va = new Int8Array(a.buffer, a.byteOffset, a.length);
  const vb = new Int8Array(b.buffer, b.byteOffset, b.length);
  let diff = 0;
  // Accumulation SANS branche : on additionne le booléen `≠` sur tout le vecteur.
  for (let i = 0; i < va.length; i++) {
    diff += va[i] !== vb[i] ? 1 : 0;
  }
  return diff / va.length;
}

/**
 * Test du seuil τ sur un scalaire NON secret. ATTENTION au nom : ce N'EST PAS un
 * comparateur cryptographique à temps constant (doc 25 §4.3). La `distance` est
 * un scalaire DÉJÀ agrégé (public) : `distance ≤ threshold` est une simple
 * comparaison IEEE-754. La VRAIE propriété anti-timing est l'absence de
 * court-circuit dans `protectedDistance` et dans la boucle `verify`.
 *
 * @param distance  Distance protégée (scalaire public).
 * @param threshold Seuil τ figé à l'enrôlement.
 * @returns `true` si `distance ≤ threshold` (match).
 */
export function scoreLeThreshold(distance: number, threshold: number): boolean {
  return distance <= threshold;
}
