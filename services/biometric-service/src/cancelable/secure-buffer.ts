/**
 * @file        secure-buffer.ts
 * @description Effacement BEST-EFFORT des buffers sensibles (vecteur de features
 *              clair, paramètre cancelable) après usage.
 *
 *              ⚠️  HONNÊTETÉ TECHNIQUE (doc 25 §4.4, DPIA §6.2). On NE promet PAS
 *              un « zero-fill RAM » garanti : en V8/Node, on ne maîtrise ni le GC
 *              (qui peut copier/déplacer les objets), ni le swap (qui peut écrire
 *              une page sur disque avant tout effacement). Les VRAIES garanties
 *              viennent du DURCISSEMENT HÔTE, à appliquer au provisioning du nœud
 *              biométrique dédié :
 *                - `swapoff -a` + `vm.swappiness=0` (la RAM sensible ne part jamais
 *                  sur disque) ;
 *                - `mlock` des pages sensibles (pas de swap, pas de core-dump
 *                  paginé) ;
 *                - `tmpfs` (`/dev/shm`) pour tout fichier temporaire ;
 *                - core dumps interdits (`RLIMIT_CORE=0`).
 *
 *              On travaille sur des `TypedArray` MUTABLES qu'on remplit de zéros
 *              en `finally` — effacement best-effort documenté comme tel, jamais
 *              présenté comme une garantie absolue.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/cancelable
 */

/**
 * Remplit un buffer mutable de zéros (effacement best-effort). No-op silencieux
 * si le buffer est absent.
 *
 * @param buf Buffer sensible (features clair / paramètre cancelable).
 */
export function wipe(buf: Uint8Array | Float64Array | Int8Array | null | undefined): void {
  if (!buf) return;
  buf.fill(0);
}

/**
 * Exécute `fn` avec un buffer sensible puis l'efface (best-effort) en `finally`,
 * que `fn` réussisse ou lève. Analogue au `with secure_buffer(...)` Python du
 * doc 25 §4.2.
 *
 * @param buf Buffer sensible (effacé après usage).
 * @param fn  Traitement à exécuter pendant que le buffer est en clair.
 * @returns Le résultat de `fn`.
 */
export async function withWipe<B extends Uint8Array | Float64Array | Int8Array, R>(
  buf: B,
  fn: (b: B) => Promise<R> | R,
): Promise<R> {
  try {
    return await fn(buf);
  } finally {
    wipe(buf);
  }
}
