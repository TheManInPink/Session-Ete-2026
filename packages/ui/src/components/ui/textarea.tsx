/**
 * @file        textarea.tsx
 * @description Textarea NINA-AES — mêmes tokens qu'Input, support error/success.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { cn } from '../../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Variant visuelle d'erreur (positionne aussi `aria-invalid`). */
  invalid?: boolean;
  /** Variant visuelle de succès (champ validé). */
  valid?: boolean;
}

/** Zone de texte multi-lignes stylée avec les design tokens NINA-AES. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, valid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex min-h-20 w-full rounded-base border bg-bg-card px-3 py-2',
        'text-sm text-fg placeholder:text-fg-muted',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive',
        valid && 'border-success',
        !invalid && !valid && 'border-border',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
