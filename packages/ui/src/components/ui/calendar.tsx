/**
 * @file        calendar.tsx
 * @description Calendrier mensuel accessible NINA-AES, sans dépendance externe
 *              (grille de jours pure React + Intl). Sémantique role="grid" /
 *              "row" / "gridcell", navigation clavier complète (flèches, Home/End,
 *              PageUp/PageDown, Enter/Espace) avec roving tabindex.
 * @module      @nina-aes/ui
 */

'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Button } from './button';

/** Propriétés du composant {@link Calendar}. */
export interface CalendarProps {
  /** Date actuellement sélectionnée (mise en évidence `bg-primary`). */
  selected?: Date;
  /** Callback déclenché à la sélection d'un jour. */
  onSelect?: (d: Date) => void;
  /** Mois affiché en mode contrôlé (n'importe quel jour de ce mois). */
  month?: Date;
  /** Mois affiché initial en mode non contrôlé (défaut : `selected ?? new Date()`). */
  defaultMonth?: Date;
  /** Callback déclenché au changement de mois affiché. */
  onMonthChange?: (d: Date) => void;
  /** Locale Intl pour les libellés (défaut : `'fr-FR'`). */
  locale?: string;
  /** Premier jour de la semaine : 0 = dimanche, 1 = lundi (défaut : 1). */
  weekStartsOn?: 0 | 1;
  /** Borne minimale sélectionnable (incluse). */
  min?: Date;
  /** Borne maximale sélectionnable (incluse). */
  max?: Date;
  /** Classes additionnelles sur le conteneur racine. */
  className?: string;
}

/**
 * Normalise une date à minuit (heure locale) pour comparer des jours sans
 * tenir compte de l'heure.
 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Vrai si deux dates tombent le même jour calendaire. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Décalage (0..6) du jour `dow` (0 = dimanche … 6 = samedi) par rapport au
 * premier jour de semaine configuré.
 */
function weekdayOffset(dow: number, weekStartsOn: 0 | 1): number {
  return (dow - weekStartsOn + 7) % 7;
}

/** Met la première lettre en majuscule (libellé mois/année). */
function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Calendrier mensuel accessible.
 *
 * Composant écrit comme une fonction simple (et non `forwardRef`) : il manipule
 * des dates et n'expose pas de `ref` DOM unique pertinente, le focus interne
 * étant géré par roving tabindex.
 *
 * @example
 *   <Calendar selected={date} onSelect={setDate} />
 */
export const Calendar = (props: CalendarProps) => {
  const {
    selected,
    onSelect,
    month,
    defaultMonth,
    onMonthChange,
    locale = 'fr-FR',
    weekStartsOn = 1,
    min,
    max,
    className,
  } = props;

  // Mois affiché : contrôlé (`month`) sinon état interne ancré au 1er du mois.
  const [internalMonth, setInternalMonth] = React.useState<Date>(() => {
    const base = defaultMonth ?? selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const isControlled = month != null;
  const displayedMonth = React.useMemo(() => {
    const base = isControlled ? (month as Date) : internalMonth;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [isControlled, month, internalMonth]);

  // Jour qui doit recevoir le focus (roving tabindex). Initialisé sur la
  // sélection si elle est dans le mois affiché, sinon le 1er du mois.
  const [focusedDate, setFocusedDate] = React.useState<Date>(() => {
    if (
      selected &&
      selected.getFullYear() === displayedMonth.getFullYear() &&
      selected.getMonth() === displayedMonth.getMonth()
    ) {
      return startOfDay(selected);
    }
    return new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1);
  });

  // Indique qu'il faut déplacer le focus DOM après un rendu déclenché clavier.
  const shouldFocusRef = React.useRef(false);
  const gridRef = React.useRef<HTMLDivElement>(null);

  // Bornes normalisées à minuit pour des comparaisons jour à jour.
  const minDay = React.useMemo(() => (min ? startOfDay(min) : null), [min]);
  const maxDay = React.useMemo(() => (max ? startOfDay(max) : null), [max]);

  const isDisabled = React.useCallback(
    (d: Date): boolean => {
      const day = startOfDay(d);
      if (minDay && day.getTime() < minDay.getTime()) return true;
      if (maxDay && day.getTime() > maxDay.getTime()) return true;
      return false;
    },
    [minDay, maxDay],
  );

  // Formatteurs Intl mémoïsés (recréés seulement si la locale change).
  const monthYearFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    [locale],
  );
  const weekdayShortFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    [locale],
  );
  const fullDateFmt = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [locale],
  );

  // Libellé "Juin 2026" capitalisé.
  const monthLabel = capitalize(monthYearFmt.format(displayedMonth));

  // Abréviations des jours, ordonnées selon `weekStartsOn`. On part d'un
  // dimanche connu (2024-01-07) puis on décale.
  const weekdayLabels = React.useMemo(() => {
    const labels: string[] = [];
    const reference = new Date(2024, 0, 7); // dimanche
    for (let i = 0; i < 7; i += 1) {
      const dow = (weekStartsOn + i) % 7;
      const day = new Date(reference);
      day.setDate(reference.getDate() + dow);
      labels.push(capitalize(weekdayShortFmt.format(day)));
    }
    return labels;
  }, [weekStartsOn, weekdayShortFmt]);

  // Géométrie du mois : nb de blancs avant le 1er et nb de jours.
  const firstOfMonth = displayedMonth;
  const leadingBlanks = weekdayOffset(firstOfMonth.getDay(), weekStartsOn);
  const daysInMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + 1,
    0,
  ).getDate();

  const today = startOfDay(new Date());

  // Change le mois affiché (état interne) et notifie toujours via callback.
  const changeMonth = React.useCallback(
    (next: Date) => {
      const normalized = new Date(next.getFullYear(), next.getMonth(), 1);
      if (!isControlled) setInternalMonth(normalized);
      onMonthChange?.(normalized);
    },
    [isControlled, onMonthChange],
  );

  const goToPreviousMonth = React.useCallback(() => {
    changeMonth(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1));
  }, [changeMonth, displayedMonth]);

  const goToNextMonth = React.useCallback(() => {
    changeMonth(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1));
  }, [changeMonth, displayedMonth]);

  // Déplace le focus clavier vers `next`, en changeant de mois affiché si la
  // cible franchit la limite du mois courant.
  const moveFocus = React.useCallback(
    (next: Date) => {
      const target = startOfDay(next);
      shouldFocusRef.current = true;
      setFocusedDate(target);
      if (
        target.getFullYear() !== displayedMonth.getFullYear() ||
        target.getMonth() !== displayedMonth.getMonth()
      ) {
        changeMonth(target);
      }
    },
    [changeMonth, displayedMonth],
  );

  // Sélectionne un jour s'il n'est pas désactivé.
  const selectDate = React.useCallback(
    (d: Date) => {
      if (isDisabled(d)) return;
      onSelect?.(startOfDay(d));
    },
    [isDisabled, onSelect],
  );

  // Après une navigation clavier, déplace le focus DOM vers le bouton du jour
  // ciblé (devenu le seul `tabIndex=0`).
  React.useEffect(() => {
    if (!shouldFocusRef.current) return;
    shouldFocusRef.current = false;
    const node = gridRef.current?.querySelector<HTMLButtonElement>(
      'button[data-day][tabindex="0"]',
    );
    node?.focus();
  }, [focusedDate, displayedMonth]);

  // Gestion clavier sur la grille (roving tabindex).
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = focusedDate;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          moveFocus(new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1));
          break;
        case 'ArrowRight':
          event.preventDefault();
          moveFocus(new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveFocus(new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7));
          break;
        case 'ArrowDown':
          event.preventDefault();
          moveFocus(new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7));
          break;
        case 'Home': {
          event.preventDefault();
          const offset = weekdayOffset(current.getDay(), weekStartsOn);
          moveFocus(
            new Date(current.getFullYear(), current.getMonth(), current.getDate() - offset),
          );
          break;
        }
        case 'End': {
          event.preventDefault();
          const offset = 6 - weekdayOffset(current.getDay(), weekStartsOn);
          moveFocus(
            new Date(current.getFullYear(), current.getMonth(), current.getDate() + offset),
          );
          break;
        }
        case 'PageUp':
          event.preventDefault();
          moveFocus(new Date(current.getFullYear(), current.getMonth() - 1, current.getDate()));
          break;
        case 'PageDown':
          event.preventDefault();
          moveFocus(new Date(current.getFullYear(), current.getMonth() + 1, current.getDate()));
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          selectDate(current);
          break;
        default:
          break;
      }
    },
    [focusedDate, moveFocus, selectDate, weekStartsOn],
  );

  // Construit la matrice des jours du mois (cellules vides + jours).
  const cells: Array<Date | null> = [];
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), day));
  }
  // Complète la dernière rangée pour des semaines de 7 cellules pleines.
  while (cells.length % 7 !== 0) cells.push(null);

  // Découpe en rangées de 7.
  const rows: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return (
    <div className={cn('inline-block w-fit select-none p-3 text-fg', className)}>
      {/* En-tête : navigation mois + libellé. */}
      <div className="flex items-center justify-between pb-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Mois précédent"
          onClick={goToPreviousMonth}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <div className="text-sm font-medium" aria-live="polite">
          {monthLabel}
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Mois suivant"
          onClick={goToNextMonth}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      {/* Grille des jours. */}
      <div role="grid" aria-label={monthLabel} ref={gridRef} onKeyDown={handleKeyDown}>
        {/* Rangée des abréviations de jours. */}
        <div role="row" className="grid grid-cols-7">
          {weekdayLabels.map((label, index) => (
            <div
              key={`${label}-${index}`}
              role="columnheader"
              aria-label={label}
              className="flex size-9 items-center justify-center text-xs font-medium text-fg-muted"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Rangées de dates. */}
        {rows.map((row, rowIndex) => (
          <div role="row" className="grid grid-cols-7" key={`row-${rowIndex}`}>
            {row.map((date, cellIndex) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${rowIndex}-${cellIndex}`}
                    role="gridcell"
                    aria-hidden="true"
                    className="size-9"
                  />
                );
              }

              const disabled = isDisabled(date);
              const isSelected = selected ? isSameDay(date, selected) : false;
              const isToday = isSameDay(date, today);
              const isFocusTarget = isSameDay(date, focusedDate);
              const dow = date.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const fullLabel = capitalize(fullDateFmt.format(date));

              return (
                <div role="gridcell" key={date.toISOString()}>
                  <button
                    type="button"
                    data-day=""
                    disabled={disabled}
                    aria-label={fullLabel}
                    aria-selected={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    tabIndex={isFocusTarget ? 0 : -1}
                    onClick={() => selectDate(date)}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-base text-sm font-normal transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                      isToday && !isSelected && 'ring-1 ring-ring',
                      isSelected && 'bg-primary text-primary-fg hover:bg-primary/90',
                      !isSelected && isWeekend && 'text-fg-muted',
                      !isSelected && 'hover:bg-bg-muted',
                      disabled && 'pointer-events-none opacity-50',
                    )}
                  >
                    {date.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
Calendar.displayName = 'Calendar';
