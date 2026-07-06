/**
 * @file        directive-card.tsx
 * @description Carte Kanban d'une directive de gouvernance (SGOGT, GOV-02).
 *              Props-driven ; bordure rouge si en retard.
 * @module      @nina-aes/ui
 */

import { AlertCircle, ArrowUp, Calendar } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export type DirectivePriority = 'P1' | 'P2' | 'P3';

const PRIORITY_CLS: Record<DirectivePriority, string> = {
  P1: 'bg-destructive/10 text-destructive',
  P2: 'bg-warning/15 text-warning',
  P3: 'bg-bg-muted text-fg-muted',
};

/** Initiales (max 2) d'un nom complet. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export interface DirectiveCardProps extends React.HTMLAttributes<HTMLElement> {
  reference: string;
  title: string;
  description?: string;
  priority?: DirectivePriority;
  assigneeName?: string;
  deadlineLabel?: string;
  /** Échéance dépassée → mise en évidence rouge. */
  overdue?: boolean;
  escalationLevel?: number;
}

/** Carte de directive pour les colonnes Kanban (DRAFT → COMPLETED). */
export const DirectiveCard = React.forwardRef<HTMLElement, DirectiveCardProps>(
  (
    {
      reference,
      title,
      description,
      priority,
      assigneeName,
      deadlineLabel,
      overdue,
      escalationLevel,
      className,
      ...props
    },
    ref,
  ) => (
    <article
      ref={ref}
      className={cn(
        'flex flex-col gap-2 rounded-base border bg-bg-card p-3 shadow-sm',
        overdue ? 'border-destructive bg-destructive/5' : 'border-border',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-fg-muted">{reference}</span>
        {overdue && <AlertCircle className="size-4 text-destructive" aria-hidden="true" />}
      </div>
      <h4 className="line-clamp-2 text-sm font-semibold text-fg">{title}</h4>
      {description && <p className="line-clamp-2 text-xs text-fg-muted">{description}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {priority && (
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              PRIORITY_CLS[priority],
            )}
          >
            {priority}
          </span>
        )}
        {escalationLevel != null && escalationLevel > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
            <ArrowUp className="size-3" aria-hidden="true" />
            n.{escalationLevel}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        {assigneeName ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {initials(assigneeName)}
            </span>
            <span className="text-fg-muted">{assigneeName}</span>
          </span>
        ) : (
          <span />
        )}
        {deadlineLabel && (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              overdue ? 'text-destructive' : 'text-fg-muted',
            )}
          >
            <Calendar className="size-3" aria-hidden="true" />
            {deadlineLabel}
          </span>
        )}
      </div>
    </article>
  ),
);
DirectiveCard.displayName = 'DirectiveCard';
