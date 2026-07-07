/**
 * @file        language-selector.tsx
 * @description Sélecteur des 8 langues nationales (drapeau + nom natif).
 *              Réutilise le Popover du design system. A11y : liste navigable,
 *              item courant marqué d'un ✓.
 * @module      @nina-aes/ui
 */

'use client';

import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { CountryFlag, type AESCountryCode } from '../brand/country-flag';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

/** Codes internes alignés sur l'enum `Language` de @nina-aes/shared-types. */
export type LanguageCode = 'FR' | 'BM' | 'SNK' | 'FF' | 'TMQ' | 'HAU' | 'MOS' | 'DJE';

/** Pays « porteur » de chaque langue (pour le drapeau affiché). */
const LANGUAGES: { code: LanguageCode; native: string; country: AESCountryCode }[] = [
  { code: 'FR', native: 'Français', country: 'MLI' },
  { code: 'BM', native: 'Bamanankan', country: 'MLI' },
  { code: 'SNK', native: 'Soninké', country: 'MLI' },
  { code: 'FF', native: 'Fulfulde', country: 'MLI' },
  { code: 'TMQ', native: 'Tamasəḥt', country: 'MLI' },
  { code: 'HAU', native: 'Hausa', country: 'MLI' },
  { code: 'MOS', native: 'Mòoré', country: 'BFA' },
  { code: 'DJE', native: 'Zarma', country: 'NER' },
];

export interface LanguageSelectorProps {
  value: LanguageCode;
  onValueChange?: (value: LanguageCode) => void;
  className?: string;
}

/** Menu déroulant de choix de langue (8 langues nationales). */
export function LanguageSelector({ value, onValueChange, className }: LanguageSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const current = LANGUAGES.find((l) => l.code === value) ?? LANGUAGES[0]!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choisir la langue"
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-base border border-border bg-bg-card px-3 text-sm text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            className,
          )}
        >
          <CountryFlag country={current.country} size={18} />
          <span className="flex-1 text-left">{current.native}</span>
          <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <ul role="listbox" aria-label="Langues">
          {LANGUAGES.map((l) => {
            const selected = l.code === value;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onValueChange?.(l.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors',
                    selected ? 'bg-primary/10 text-primary' : 'text-fg hover:bg-bg-muted',
                  )}
                >
                  <CountryFlag country={l.country} size={18} />
                  <span className="flex-1 text-left">{l.native}</span>
                  {selected && <Check className="size-4" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
LanguageSelector.displayName = 'LanguageSelector';
