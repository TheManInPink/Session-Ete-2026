/**
 * @file        switch.tsx
 * @description Switch (toggle) NINA-AES — Radix Switch + tokens. Tailles sm/md.
 *              A11y : role="switch", aria-checked géré par Radix, label cliquable.
 * @module      @nina-aes/ui
 */

'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/utils';

const switchVariants = cva(
  [
    'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:bg-primary data-[state=unchecked]:bg-border',
  ],
  {
    variants: { size: { sm: 'h-5 w-9', md: 'h-6 w-11' } },
    defaultVariants: { size: 'md' },
  },
);

const switchThumbVariants = cva(
  'pointer-events-none block rounded-full bg-bg-card shadow-sm ring-0 transition-transform data-[state=unchecked]:translate-x-0',
  {
    variants: {
      size: {
        sm: 'h-4 w-4 data-[state=checked]:translate-x-4',
        md: 'h-5 w-5 data-[state=checked]:translate-x-5',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> &
  VariantProps<typeof switchVariants>;

/** Interrupteur on/off accessible. */
export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, size, ...props }, ref) => (
  <SwitchPrimitive.Root ref={ref} className={cn(switchVariants({ size }), className)} {...props}>
    <SwitchPrimitive.Thumb className={cn(switchThumbVariants({ size }))} />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';
