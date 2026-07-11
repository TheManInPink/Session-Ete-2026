/**
 * @file        priority-slot.tsx
 * @description Créneau de RDV (PC-04) avec barre d'indicateur de priorité
 *              (P1 danger / P2 warning / P3 neutre) et états available/selected/booked.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { cn } from '../../lib/utils';

export type SlotPriority = 'P1' | 'P2' | 'P3';
export type SlotState = 'available' | 'selected' | 'booked';

const INDICATOR: Record<SlotPriority, string> = {
  P1: 'bg-destructive',
  P2: 'bg-warning',
  P3: 'bg-border',
};

export interface PrioritySlotProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** Heure affichée en gros (ex. « 07h30 »). */
  time: string;
  /** Sous-libellé optionnel (ex. places restantes). */
  label?: string;
  priority: SlotPriority;
  state?: SlotState;
  /**
   * Libellé du badge (défaut : le code de priorité). Permet un libellé honnête
   * — ex. « Prioritaire » / « Standard » — quand la nature du créneau est binaire
   * (le niveau P1/P2/P3 n'étant décidé qu'à la réservation).
   */
  badge?: React.ReactNode;
}

/** Bouton de sélection d'un créneau horaire. */
export const PrioritySlot = React.forwardRef<HTMLButtonElement, PrioritySlotProps>(
  ({ time, label, priority, state = 'available', badge, className, disabled, ...props }, ref) => {
    const booked = state === 'booked';
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || booked}
        aria-pressed={state === 'selected'}
        className={cn(
          'relative flex w-full items-center gap-3 overflow-hidden rounded-base border bg-bg-card p-3 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          state === 'selected'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/60',
          booked && 'cursor-not-allowed opacity-50',
          className,
        )}
        {...props}
      >
        <span
          className={cn('absolute inset-y-0 left-0 w-1.5', INDICATOR[priority])}
          aria-hidden="true"
        />
        <span className="flex flex-1 flex-col pl-2">
          <span className="font-display text-xl font-bold text-fg">{time}</span>
          {label && <span className="text-xs text-fg-muted">{label}</span>}
        </span>
        <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs font-semibold text-fg-muted">
          {booked ? 'Pris' : (badge ?? priority)}
        </span>
      </button>
    );
  },
);
PrioritySlot.displayName = 'PrioritySlot';
