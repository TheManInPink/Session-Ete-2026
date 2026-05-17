/**
 * @file        input.tsx
 * @description Input texte standardisé NINA-AES — accessible, support error/success.
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Variant visuelle conditionnée par l'état de validation. */
  invalid?: boolean;
  /** Variant visuelle de succès (champ validé). */
  valid?: boolean;
}

/**
 * Input HTML stylé avec design tokens NINA-AES.
 *
 * Accessibilité :
 *   - `aria-invalid` automatiquement positionné si `invalid` est true
 *   - focus ring 3px color/primary
 *   - placeholder discret (color/neutral/400)
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', invalid, valid, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          // Base
          'flex h-10 w-full rounded-base border bg-bg-card px-3 py-2',
          'text-sm text-fg placeholder:text-fg-muted',
          'transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // States
          invalid && 'border-destructive bg-danger-50/30',
          valid && 'border-success',
          !invalid && !valid && 'border-border',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
