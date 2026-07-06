/**
 * @file        combobox.tsx
 * @description Combobox NINA-AES — sélecteur recherchable accessible, construit sur
 *              Popover (Radix) + une liste filtrée maison (sans dépendance neuve).
 *              A11y : motif WAI-ARIA combobox — role="combobox" sur le déclencheur,
 *              role="listbox"/role="option" pour la liste, aria-activedescendant
 *              pour l'option active au clavier, navigation flèches + Entrée + Échap.
 * @module      @nina-aes/ui
 */

'use client';

import { Check, ChevronsUpDown, Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/** Une option sélectionnable du combobox. */
export interface ComboboxOption {
  /** Valeur technique unique (renvoyée par onValueChange). */
  value: string;
  /** Libellé affiché à l'utilisateur. */
  label: string;
  /** Désactive l'option (non sélectionnable). */
  disabled?: boolean;
}

export interface ComboboxProps {
  /** Liste des options proposées. */
  options: ComboboxOption[];
  /** Valeur sélectionnée (contrôlée). */
  value?: string;
  /** Callback déclenché à la sélection d'une option. */
  onValueChange?: (value: string) => void;
  /** Texte affiché quand aucune valeur n'est sélectionnée. */
  placeholder?: string;
  /** Texte indicatif du champ de recherche. */
  searchPlaceholder?: string;
  /** Texte affiché quand aucune option ne correspond à la recherche. */
  emptyText?: string;
  /** Taille du déclencheur (chrome identique à Input). */
  size?: 'sm' | 'md' | 'lg';
  /** Désactive entièrement le combobox. */
  disabled?: boolean;
  /** Identifiant du déclencheur (pour association à un label externe). */
  id?: string;
  /** Classes additionnelles sur le déclencheur. */
  className?: string;
}

/** Hauteurs du déclencheur, calquées sur les tailles d'Input. */
const SIZE_CLASSES: Record<NonNullable<ComboboxProps['size']>, string> = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-12',
};

/**
 * Normalise une chaîne pour une recherche insensible à la casse ET aux accents.
 * Ex. « Ségou » → « segou », « MOPTI » → « mopti ».
 */
function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Combobox accessible (sélecteur recherchable, sélection unique).
 *
 * Le déclencheur reproduit le chrome d'Input/SelectTrigger ; le contenu
 * (Popover) embarque un champ de recherche filtrant et une liste d'options.
 * La sélection est unique ; le multi-select reste une évolution future.
 *
 * @remarks
 *   La ref est transmise au `<button>` déclencheur (role="combobox").
 */
export const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder = 'Sélectionner…',
      searchPlaceholder = 'Rechercher…',
      emptyText = 'Aucun résultat',
      size = 'md',
      disabled,
      id,
      className,
    },
    ref,
  ) => {
    // État d'ouverture contrôlé (permet de fermer après sélection).
    const [open, setOpen] = React.useState(false);
    // Terme de recherche saisi dans le champ interne.
    const [search, setSearch] = React.useState('');
    // Index de l'option active au clavier (aria-activedescendant).
    const [activeIndex, setActiveIndex] = React.useState(0);

    // Identifiants stables (SSR-safe) pour le câblage aria.
    const reactId = React.useId();
    const listboxId = `${reactId}-listbox`;
    const searchId = `${reactId}-search`;
    /** Construit l'id d'une option à partir de son index filtré. */
    const optionId = React.useCallback((index: number) => `${reactId}-option-${index}`, [reactId]);

    // Options filtrées (insensible casse + accents).
    const filtered = React.useMemo(() => {
      const term = normalize(search.trim());
      if (term.length === 0) return options;
      return options.filter((option) => normalize(option.label).includes(term));
    }, [options, search]);

    // Libellé courant à afficher dans le déclencheur.
    const selectedLabel = React.useMemo(
      () => options.find((option) => option.value === value)?.label,
      [options, value],
    );

    // Réinitialise recherche + option active à chaque ouverture/fermeture.
    React.useEffect(() => {
      if (!open) {
        setSearch('');
        setActiveIndex(0);
      }
    }, [open]);

    // Garde l'index actif dans les bornes des options filtrées.
    React.useEffect(() => {
      setActiveIndex((current) => {
        if (filtered.length === 0) return 0;
        return Math.min(current, filtered.length - 1);
      });
    }, [filtered.length]);

    /** Sélectionne une option : notifie, puis ferme le Popover. */
    const handleSelect = React.useCallback(
      (option: ComboboxOption) => {
        if (option.disabled) return;
        onValueChange?.(option.value);
        setOpen(false);
      },
      [onValueChange],
    );

    /** Avance l'option active vers une option non désactivée (direction +1/-1). */
    const moveActive = React.useCallback(
      (direction: 1 | -1) => {
        if (filtered.length === 0) return;
        setActiveIndex((current) => {
          let next = current;
          for (let step = 0; step < filtered.length; step += 1) {
            next = (next + direction + filtered.length) % filtered.length;
            if (!filtered[next]?.disabled) return next;
          }
          return current;
        });
      },
      [filtered],
    );

    // Clavier sur le champ de recherche (motif WAI-ARIA combobox).
    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveActive(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveActive(-1);
          break;
        case 'Enter': {
          event.preventDefault();
          const option = filtered[activeIndex];
          if (option) handleSelect(option);
          break;
        }
        // Échap : on laisse aussi Radix Popover gérer la fermeture.
        case 'Escape':
          setOpen(false);
          break;
        default:
          break;
      }
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={ref}
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            disabled={disabled}
            className={cn(
              // Chrome identique à Input / SelectTrigger.
              'flex w-full items-center justify-between gap-2 rounded-base border border-border bg-bg-card px-3 text-sm text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'disabled:cursor-not-allowed disabled:opacity-50',
              SIZE_CLASSES[size],
              className,
            )}
          >
            <span className={cn('line-clamp-1 text-left', !selectedLabel && 'text-fg-muted')}>
              {selectedLabel ?? placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
          // Le focus doit aller au champ de recherche, pas à la première option.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(searchId)?.focus();
          }}
        >
          {/* Champ de recherche avec icône Search à gauche. */}
          <div className="relative border-b border-border">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={filtered.length > 0 ? optionId(activeIndex) : undefined}
              className="h-10 rounded-none border-0 pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {/* Liste des options filtrées. */}
          <div
            id={listboxId}
            role="listbox"
            aria-label={searchPlaceholder}
            className="max-h-60 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-fg-muted">{emptyText}</p>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <div
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onClick={() => handleSelect(option)}
                    onMouseEnter={() => {
                      if (!option.disabled) setActiveIndex(index);
                    }}
                    className={cn(
                      // pl-8 réserve la place de l'icône Check.
                      'relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-fg',
                      isActive && 'bg-bg-muted',
                      option.disabled && 'pointer-events-none opacity-50',
                    )}
                  >
                    {isSelected && (
                      <Check className="absolute left-2 size-4 text-primary" aria-hidden="true" />
                    )}
                    <span className="line-clamp-1">{option.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
Combobox.displayName = 'Combobox';
