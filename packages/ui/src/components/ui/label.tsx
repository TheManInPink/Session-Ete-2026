/**
 * @file        label.tsx
 * @description Label HTML — associé à un input via htmlFor. WCAG 2.2 critère 3.3.2.
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { cn } from '../../lib/utils.js';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none text-fg',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
