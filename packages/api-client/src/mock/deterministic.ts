/**
 * @file        deterministic.ts
 * @description Boîte à outils **déterministe** partagée par les fixtures mock.
 *
 *              Aucune source d'entropie runtime (`Date.now()`, `Math.random()`
 *              non seedé) : le même texte de graine produit toujours la même
 *              valeur → captures rejouables, e2e stables. Les algorithmes
 *              (FNV-1a, xorshift, Mulberry32) sont volontairement identiques à
 *              ceux déjà présents dans `demo-citizen.ts` et
 *              `apps/admin/lib/mock-dashboard.ts` afin que les valeurs générées
 *              ne changent pas d'une tranche à l'autre.
 *
 * @module      @nina-aes/api-client
 */

/** Hash FNV-1a 32 bits → graine reproductible. */
export function seedOf(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1;
}

/**
 * Chaîne hexadécimale **déterministe** de longueur arbitraire (flux xorshift
 * seedé par FNV-1a). Sert aux hashs factices (chainHash, signatures).
 */
export function hexFrom(seedText: string, length: number): string {
  let state = seedOf(seedText);
  let out = '';
  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out += (state & 0xf).toString(16);
  }
  return out;
}

/** UUID v4 **déterministe** (valide RFC 4122) dérivé d'une graine textuelle. */
export function uuidFrom(seedText: string): string {
  const h = hexFrom(seedText, 32);
  // Variant (1 nibble dans {8,9,a,b}) imposé à la 17e position.
  const variant = ((parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * PRNG Mulberry32 seedé — réplique exacte du générateur utilisé par
 * `apps/admin/lib/mock-dashboard.ts` (mêmes graines ⇒ mêmes chiffres, condition
 * de stabilité des e2e admin).
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Horodatage fixe (pas de `Date.now()` → reproductible). */
export const FIXED_NOW = '2026-06-01T09:00:00.000Z';

/** Époque (ms) correspondant à {@link FIXED_NOW} — arithmétique de dates fixe. */
export const FIXED_EPOCH = Date.parse(FIXED_NOW);

/** ISO 8601 décalé de `hours` heures par rapport à un instant ISO donné. */
export function isoHoursFrom(baseIso: string, hours: number): string {
  return new Date(Date.parse(baseIso) + hours * 3_600_000).toISOString();
}

/** Date `YYYY-MM-DD` située `daysAgo` jours avant {@link FIXED_NOW}. */
export function isoDayBefore(daysAgo: number): string {
  return new Date(FIXED_EPOCH - daysAgo * 24 * 3_600_000).toISOString().slice(0, 10);
}

// ── NINA synthétiques valides ─────────────────────────────────────────────────

/** Alphabet de contrôle NINA (23 lettres, sans I ni O) — cf. `@nina-aes/utils`. */
const CONTROL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Calcule la lettre de contrôle d'un NINA (somme pondérée modulo 23).
 *
 * Duplication assumée de `computeControlLetter` (`@nina-aes/utils`) pour ne pas
 * ajouter une arête de dépendance au client — l'algorithme est figé par la
 * spécification NINA (doc 02) et couvert de tests côté utils.
 */
export function ninaControlLetter(digits: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    sum += Number(digits[i]) * (i + 1);
  }
  return CONTROL_ALPHABET[sum % 23]!;
}

/**
 * Construit un NINA synthétique **valide** (14 chiffres + lettre de contrôle
 * correcte) à partir de ses composants structurels.
 *
 * @param parts - Composants : sexe (1|2), année/mois (2 ch.), région (1 ch.),
 *                cercle (2 ch.), commune (3 ch.), séquentiel (3 ch.).
 */
export function buildNina(parts: {
  sex: 1 | 2;
  year: string;
  month: string;
  region: string;
  cercle: string;
  commune: string;
  sequence: string;
}): string {
  const digits = `${parts.sex}${parts.year}${parts.month}${parts.region}${parts.cercle}${parts.commune}${parts.sequence}`;
  return `${digits}${ninaControlLetter(digits)}`;
}
