/**
 * @file        sheet.tsx
 * @description Sheet — drawer latéral (Radix Dialog + side variant).
 *              Utilisé pour le panneau de détail dans `apps/admin/AD-02`
 *              (drawer right 480px) ; supporte aussi `left`, `top`, `bottom`.
 *
 *              Accessibilité : focus trap, Esc pour fermer, click overlay
 *              pour fermer, `role="dialog"` + `aria-modal`. Radix gère tout.
 *
 * @module      @nina-aes/ui
 */

'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils.js';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const sheetVariants = cva(
  [
    'fixed z-50 gap-4 bg-bg-card shadow-lg',
    'transition ease-in-out',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:duration-200 data-[state=open]:duration-300',
  ],
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b border-border data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t border-border data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-md',
        right:
          'inset-y-0 right-0 h-full w-full border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md md:max-w-lg lg:max-w-xl',
      },
    },
    defaultVariants: { side: 'right' },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Désactive le bouton de fermeture par défaut en haut à droite. */
  hideCloseButton?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, hideCloseButton, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      {!hideCloseButton && (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-4 top-4 rounded-base p-1 text-fg-muted',
            'transition-opacity hover:opacity-100 hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label="Fermer"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 border-b border-border px-6 py-4', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'mt-auto flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end',
      className,
    )}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold tracking-tight', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-fg-muted', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
