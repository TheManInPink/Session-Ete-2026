/**
 * @file        correction-timeline.tsx
 * @description Timeline verticale du cycle de vie d'une demande de correction
 *              (PC-05). Pilotée par une liste de nœuds (done / current / todo).
 * @module      @nina-aes/ui
 */

import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export type TimelineNodeState = 'done' | 'current' | 'todo';

export interface TimelineNode {
  label: string;
  date?: string;
  state: TimelineNodeState;
  icon?: LucideIcon;
}

export interface CorrectionTimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  nodes: TimelineNode[];
}

/** Fil vertical des étapes (pastille pleine = faite, anneau = en cours). */
export const CorrectionTimeline = React.forwardRef<HTMLOListElement, CorrectionTimelineProps>(
  ({ nodes, className, ...props }, ref) => (
    <ol ref={ref} className={cn('flex flex-col', className)} {...props}>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        const Icon = node.icon;
        return (
          <li
            key={node.label}
            aria-current={node.state === 'current' ? 'step' : undefined}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full border-2',
                  node.state === 'done' && 'border-primary bg-primary text-primary-fg',
                  node.state === 'current' && 'border-warning text-warning',
                  node.state === 'todo' && 'border-border text-fg-muted',
                )}
              >
                {Icon ? (
                  <Icon className="size-4" aria-hidden="true" />
                ) : (
                  <span className="text-sm font-semibold">{i + 1}</span>
                )}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'my-1 w-0.5 flex-1',
                    node.state === 'done' ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </div>
            <div className="pb-6">
              <p
                className={cn(
                  'text-sm font-medium',
                  node.state === 'current'
                    ? 'text-warning'
                    : node.state === 'done'
                      ? 'text-fg'
                      : 'text-fg-muted',
                )}
              >
                {node.label}
              </p>
              {node.date && <p className="text-xs text-fg-muted">{node.date}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  ),
);
CorrectionTimeline.displayName = 'CorrectionTimeline';
