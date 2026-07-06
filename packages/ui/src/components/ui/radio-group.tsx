/**
 * @file        radio-group.tsx
 * @description RadioGroup NINA-AES — Radix RadioGroup + tokens. Tailles sm/md.
 *              A11y : role="radiogroup", navigation flèches, aria-checked Radix.
 * @module      @nina-aes/ui
 */

'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { Circle } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

/** Conteneur du groupe radio (grille verticale par défaut). */
export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />
));
RadioGroup.displayName = 'RadioGroup';

const radioItemVariants = cva(
  [
    'aspect-square rounded-full border border-border text-primary',
    'ring-offset-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:border-primary',
  ],
  {
    variants: { size: { sm: 'h-4 w-4', md: 'h-5 w-5' } },
    defaultVariants: { size: 'md' },
  },
);

export type RadioGroupItemProps = React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> &
  VariantProps<typeof radioItemVariants>;

/** Bouton radio individuel (point central rempli si sélectionné). */
export const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, size, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(radioItemVariants({ size }), className)}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle className="h-2 w-2 fill-current text-current" aria-hidden="true" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = 'RadioGroupItem';
