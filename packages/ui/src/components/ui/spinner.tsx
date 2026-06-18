/**
 * @file        spinner.tsx
 * @description Spinner NINA-AES — indicateur de chargement accessible.
 *              A11y : role="status" + libellé sr-only (traduisible).
 * @module      @nina-aes/ui
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

const spinnerVariants = cva('animate-spin text-primary', {
  variants: { size: { sm: 'size-4', md: 'size-6', lg: 'size-8' } },
  defaultVariants: { size: 'md' },
});

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof spinnerVariants> {
  /** Libellé annoncé aux lecteurs d'écran (défaut « Chargement… »). */
  label?: string;
}

/** Roue de chargement (icône Lucide qui tourne). */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size, label = 'Chargement…', ...props }, ref) => (
    <span ref={ref} role="status" {...props}>
      <Loader2 className={cn(spinnerVariants({ size }), className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  ),
);
Spinner.displayName = 'Spinner';
