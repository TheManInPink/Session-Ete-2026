/**
 * @file        alert.tsx
 * @description Alert NINA-AES — 4 variants sémantiques (info/success/warning/danger).
 *              `role="alert"` ou `role="status"` selon le caractère interruptif.
 * @module      @nina-aes/ui
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-base border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-11',
  {
    variants: {
      variant: {
        info: 'border-info/30 bg-info-50 text-info-700 [&>svg]:text-info-500',
        success: 'border-success/30 bg-success-50 text-success-700 [&>svg]:text-success-500',
        warning: 'border-warning/30 bg-warning-50 text-warning-700 [&>svg]:text-warning-500',
        danger: 'border-destructive/30 bg-danger-50 text-danger-700 [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

const iconByVariant = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  /** Rôle ARIA — `alert` pour les erreurs urgentes, `status` pour informatif. */
  role?: 'alert' | 'status';
  /** Désactive l'icône (par défaut, icône Lucide sémantique affichée). */
  hideIcon?: boolean;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', role = 'status', hideIcon, children, ...props }, ref) => {
    const Icon = iconByVariant[variant ?? 'info'];
    return (
      <div ref={ref} role={role} className={cn(alertVariants({ variant }), className)} {...props}>
        {!hideIcon && <Icon className="size-5" aria-hidden="true" />}
        {children}
      </div>
    );
  },
);
Alert.displayName = 'Alert';

export const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';
