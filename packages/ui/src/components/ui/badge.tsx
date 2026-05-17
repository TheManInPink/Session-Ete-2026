/**
 * @file        badge.tsx
 * @description Badge NINA-AES — 4 variants × 3 tailles. Usage : statuts (REVIEW,
 *              APPROVED, REJECTED), priorités (P1/P2/P3), tags.
 * @module      @nina-aes/ui
 */

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium transition-colors',
  {
    variants: {
      variant: {
        solid: 'bg-primary text-primary-fg',
        soft: 'bg-primary-100 text-primary-700',
        outline: 'border border-border text-fg',
        success: 'bg-success-50 text-success-700',
        warning: 'bg-warning-50 text-warning-700',
        danger: 'bg-danger-50 text-danger-700',
        info: 'bg-info-50 text-info-700',
        muted: 'bg-bg-muted text-fg-muted',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-sm',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: { variant: 'soft', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
