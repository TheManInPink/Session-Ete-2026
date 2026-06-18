/**
 * @file        aes-country-switcher.tsx
 * @description Sélecteur segmenté 3 positions Mali / Burkina / Niger (interop AES).
 *              A11y : role="radiogroup", chaque segment role="radio".
 * @module      @nina-aes/ui
 */

'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

export type AESCountry = 'MLI' | 'BFA' | 'NER';

const COUNTRIES: { code: AESCountry; flag: string; label: string }[] = [
  { code: 'MLI', flag: '🇲🇱', label: 'Mali' },
  { code: 'BFA', flag: '🇧🇫', label: 'Burkina Faso' },
  { code: 'NER', flag: '🇳🇪', label: 'Niger' },
];

export interface AESCountrySwitcherProps {
  value: AESCountry;
  onValueChange?: (value: AESCountry) => void;
  className?: string;
}

/** Bascule entre les 3 pays de l'Alliance des États du Sahel. */
export function AESCountrySwitcher({ value, onValueChange, className }: AESCountrySwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Pays AES"
      className={cn('inline-flex gap-1 rounded-base bg-bg-muted p-1', className)}
    >
      {COUNTRIES.map((c) => {
        const active = c.code === value;
        return (
          <button
            key={c.code}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={c.label}
            onClick={() => onValueChange?.(c.code)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
              active ? 'bg-bg-card text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span aria-hidden="true">{c.flag}</span>
            {c.code}
          </button>
        );
      })}
    </div>
  );
}
AESCountrySwitcher.displayName = 'AESCountrySwitcher';
