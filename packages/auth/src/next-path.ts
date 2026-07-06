/**
 * @file        next-path.ts
 * @description Résolution sûre du paramètre `?next=` post-login.
 *
 *              Contrat : les producteurs (proxys, pages protégées, providers)
 *              passent toujours un chemin absolu déjà préfixé par la locale
 *              (`/fr/dashboard`). Le paramètre est donc utilisé tel quel — on
 *              ne préfixe QUE le défaut de configuration (`defaultNext`),
 *              jamais une valeur produite par l'app (sinon `/fr/fr/…` → 404).
 *
 *              Sécurité (CWE-601) : `next` est une entrée non fiable (query
 *              string, ou cookie oidc_state non signé). Un simple test de
 *              préfixe ne suffit PAS : le parseur WHATWG (`new URL`) supprime
 *              tab/LF/CR AVANT analyse, donc `/\t/evil.com` deviendrait
 *              `//evil.com` (hors-origine) tout en passant une garde naïve.
 *              On rejette donc tout caractère de contrôle, puis on re-résout
 *              contre une origine sentinelle et on vérifie qu'on n'en sort pas.
 *
 * @module      @nina-aes/auth
 */

/** Origine factice servant à valider que `next` reste relatif même-origine. */
const SENTINEL_ORIGIN = 'http://nina.invalid';

/** Vrai si la chaîne contient un caractère de contrôle C0 (0x00–0x1F) ou DEL. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Valide `next` et retourne le chemin de redirection post-login.
 *
 * - `next` valide (chemin relatif même-origine : commence par un seul `/`,
 *   sans `//` ni backslash ni caractère de contrôle) → chemin normalisé,
 *   utilisable tel quel par `new URL(path, req.url)` ;
 * - sinon (absent, URL absolue, `//host`, `/\host`, `/\t/host`, CR/LF…) →
 *   `/{locale}{defaultNext}`.
 */
export function resolveNextPath(
  next: string | null | undefined,
  locale: string,
  defaultNext = '/dashboard',
): string {
  const fallback = `/${locale}${defaultNext}`;
  if (typeof next !== 'string' || next.length === 0) return fallback;

  // 1) Caractères de contrôle (tab/LF/CR et autres C0/DEL) : le parseur URL les
  //    supprime et pourrait recomposer un `//host` hors-origine.
  if (hasControlChar(next)) return fallback;

  // 2) Gardes de forme : chemin relatif absolu, pas protocol-relative, pas de
  //    backslash (que le parseur normaliserait en `/`).
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;

  // 3) Défense en profondeur : re-résoudre contre une origine sentinelle et
  //    vérifier que le résultat n'a pas changé d'origine.
  try {
    const resolved = new URL(next, SENTINEL_ORIGIN);
    if (resolved.origin !== SENTINEL_ORIGIN) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
