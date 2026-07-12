/**
 * @file        similarity.ts
 * @description Similarité de chaînes — indicateur LOCAL et déterministe utilisé
 *              par le wizard de correction (PC-03) pour estimer, côté client,
 *              l'écart entre l'ancienne et la nouvelle valeur d'un champ.
 *
 *              Ce n'est **pas** un score IA : aucun modèle, aucun appel réseau,
 *              aucune donnée fabriquée. L'analyse officielle est réalisée par le
 *              service au moment de la soumission. La comparaison est insensible
 *              à la casse et aux accents (repli NFD) pour rester pertinente sur
 *              des noms et lieux maliens.
 * @module      @nina-aes/citizen
 */

/** Normalise pour comparaison : trim, minuscules, diacritiques retirés. */
function fold(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Similarité de Jaro ∈ [0,1] entre deux chaînes déjà normalisées. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;

  // Fenêtre d'appariement (au plus la moitié de la plus longue chaîne − 1).
  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const aFlags = new Array<boolean>(la).fill(false);
  const bFlags = new Array<boolean>(lb).fill(false);

  let matches = 0;
  for (let i = 0; i < la; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, lb);
    for (let j = start; j < end; j++) {
      if (bFlags[j] || a[i] !== b[j]) continue;
      aFlags[i] = true;
      bFlags[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  // Transpositions : moitié des caractères appariés hors séquence.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!aFlags[i]) continue;
    while (!bFlags[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (matches / la + matches / lb + (matches - transpositions) / matches) / 3;
}

/**
 * Similarité Jaro-Winkler ∈ [0,1] (bonus de préfixe commun, p = 0.1, max 4).
 *
 * @param a - Première chaîne (ex. valeur actuelle).
 * @param b - Seconde chaîne (ex. valeur proposée).
 * @returns Similarité normalisée : 1 = identiques, 0 = totalement différentes.
 */
export function jaroWinkler(a: string, b: string): number {
  const s1 = fold(a);
  const s2 = fold(b);
  if (s1 === s2) return 1;

  const j = jaro(s1, s2);
  let prefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

/** Score entier 0-100 dérivé de {@link jaroWinkler}. */
export function similarityScore(a: string, b: string): number {
  return Math.round(jaroWinkler(a, b) * 100);
}
