/**
 * @file        date-picker.tsx
 * @description Sélecteur de date NINA-AES — Popover + déclencheur Button + le
 *              Calendar du design system. La date choisie est formatée via
 *              Intl.DateTimeFormat dans la locale demandée. A11y : le
 *              déclencheur expose un `aria-label` explicite quand aucune date
 *              n'est encore sélectionnée, le focus est piégé dans le popover et
 *              restitué au déclencheur à la fermeture (géré par Radix).
 * @module      @nina-aes/ui
 */

'use client';

import { CalendarDays } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/** Propriétés du composant {@link DatePicker}. */
export interface DatePickerProps {
  /** Date actuellement sélectionnée (mode contrôlé). */
  value?: Date;
  /** Callback déclenché à la sélection (ou désélection) d'une date. */
  onChange?: (d: Date | undefined) => void;
  /** Texte affiché tant qu'aucune date n'est sélectionnée. */
  placeholder?: string;
  /** Locale Intl pour le formatage de la date et du calendrier (défaut : `'fr-FR'`). */
  locale?: string;
  /** Borne minimale sélectionnable (incluse). */
  min?: Date;
  /** Borne maximale sélectionnable (incluse). */
  max?: Date;
  /** Désactive le déclencheur et empêche l'ouverture du popover. */
  disabled?: boolean;
  /** Classes additionnelles sur le bouton déclencheur. */
  className?: string;
  /** Identifiant DOM du déclencheur (pour association `htmlFor`). */
  id?: string;
}

/**
 * Sélecteur de date composé d'un déclencheur {@link Button} et d'un
 * {@link Calendar} affiché dans un {@link Popover}.
 *
 * La `ref` est transmise au bouton déclencheur, ce qui permet d'y associer un
 * libellé externe ou d'y poser le focus programmatiquement.
 *
 * @example
 *   const [date, setDate] = React.useState<Date>();
 *   <DatePicker value={date} onChange={setDate} />
 */
export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Choisir une date',
      locale = 'fr-FR',
      min,
      max,
      disabled,
      className,
      id,
    },
    ref,
  ) => {
    // État d'ouverture du popover (refermé après une sélection).
    const [open, setOpen] = React.useState(false);

    // Formatteur Intl mémoïsé — recréé seulement si la locale change.
    const dateFmt = React.useMemo(
      () => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }),
      [locale],
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            // Sans valeur, le bouton n'a pas de texte signifiant : on annonce
            // donc son rôle via aria-label.
            aria-label={value ? undefined : placeholder}
            className={cn('w-full justify-start gap-2 font-normal', className)}
          >
            <CalendarDays className="size-4" aria-hidden="true" />
            {value ? dateFmt.format(value) : <span className="text-fg-muted">{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <Calendar
            selected={value}
            onSelect={(d) => {
              onChange?.(d);
              setOpen(false);
            }}
            locale={locale}
            min={min}
            max={max}
          />
        </PopoverContent>
      </Popover>
    );
  },
);
DatePicker.displayName = 'DatePicker';
