/**
 * @file        cn.ts
 * @description Utilitaire de fusion de classes CSS conditionnelles.
 *              Utilisé par tous les composants React du design system AES.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      utils
 */

/**
 * Fusionne des noms de classes CSS en filtrant les valeurs falsy.
 * Alternative légère à `clsx` + `tailwind-merge` pour les cas simples.
 *
 * @example
 * cn('btn', isActive && 'btn-active', isDisabled && 'opacity-50')
 * // → "btn btn-active" si isActive est true et isDisabled est false
 *
 * @param classes - Liste de noms de classes (string, undefined, null, false)
 * @returns Chaîne de classes CSS fusionnées, séparées par des espaces
 */
export function cn(...classes: Array<string | undefined | null | false>): string {
  return classes.filter(Boolean).join(' ');
}
