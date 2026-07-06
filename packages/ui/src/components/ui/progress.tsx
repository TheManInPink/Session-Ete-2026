/**
 * @file        progress.tsx
 * @description Progress (barre) NINA-AES — Radix Progress. A11y : role
 *              progressbar + aria-valuenow/min/max gérés par Radix.
 *              (Pour une jauge circulaire, voir charts/integrity-gauge.)
 * @module      @nina-aes/ui
 */

'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as React from 'react';

import { cn } from '../../lib/utils';

/** Barre de progression 0-100 (valeur via prop `value`). */
export const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-bg-muted', className)}
    value={value}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-transform"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = 'Progress';
