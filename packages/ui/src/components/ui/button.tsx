/**
 * @file        button.tsx
 * @description Composant Button NINA-AES — 5 variants × 5 tailles × 6 states.
 *              Implémentation type shadcn/ui (Radix Slot + CVA).
 * @module      @nina-aes/ui
 */

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  // Base : focus ring, transitions, disabled state, accessibilité tactile
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-base',
    'text-sm font-medium ring-offset-bg transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        solid: 'bg-primary text-primary-fg hover:bg-primary/90 active:bg-primary/95',
        soft: 'bg-bg-muted text-fg hover:bg-bg-muted/80',
        outline: 'border border-border bg-bg-card text-fg hover:bg-bg-muted',
        ghost: 'text-fg hover:bg-bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-fg hover:bg-destructive/90',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs',
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 py-2',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'solid', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Si `true`, le composant rend son enfant via Radix Slot (composition). */
  asChild?: boolean;
  /** Affiche un spinner et désactive le bouton pendant une action async. */
  loading?: boolean;
}

/**
 * Bouton standardisé NINA-AES.
 *
 * @example
 *   <Button variant="solid" size="md" loading={isPending}>Envoyer</Button>
 *   <Button asChild variant="outline"><Link href="/">Retour</Link></Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    // Mode composition (Radix Slot) : exactement UN enfant requis par
    // `React.Children.only`. On ne préfixe donc pas le spinner — le caller
    // doit gérer l'état loading lui-même via `<Link>` désactivé etc.
    if (asChild) {
      return (
        <Slot ref={ref as React.Ref<HTMLElement>} className={classes} aria-busy={loading || undefined} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
