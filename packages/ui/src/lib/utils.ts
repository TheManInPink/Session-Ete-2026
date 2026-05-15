/**
 * @file        utils.ts
 * @description Utilitaires UI partagés (cn() pour merge de classes Tailwind).
 * @module      @nina-aes/ui
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Fusionne des classes Tailwind en supprimant les conflits.
 *
 * @example
 *   cn('px-2 py-1', 'px-3') // → 'py-1 px-3'
 *   cn('bg-red-500', condition && 'bg-blue-500') // → conditionnel
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
