/**
 * @file        empty-state.tsx
 * @description EmptyState NINA-AES — illustration + titre + description + CTA.
 *              Pattern « vide » du design system (PC-05, AD-*, …).
 * @module      @nina-aes/ui
 */

import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icône Lucide affichée en haut (ex. inbox vide). */
  icon?: LucideIcon;
  /** Titre court (rendu en <h3>). */
  title: string;
  /** Texte explicatif optionnel. */
  description?: string;
  /** Action proéminente (ex. <Button>). */
  action?: React.ReactNode;
}

/** État vide : icône sobre + titre + description + CTA. */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-12 text-fg-muted" aria-hidden="true" />}
      <h3 className="text-lg font-semibold text-fg">{title}</h3>
      {description && <p className="max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
