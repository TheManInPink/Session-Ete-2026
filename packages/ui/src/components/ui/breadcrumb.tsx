/**
 * @file        breadcrumb.tsx
 * @description Breadcrumb NINA-AES — composé. A11y : nav aria-label="breadcrumb",
 *              aria-current="page" sur la page courante (BreadcrumbPage).
 * @module      @nina-aes/ui
 */

import { Slot } from '@radix-ui/react-slot';
import { ChevronRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export const Breadcrumb = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'nav'>>(
  (props, ref) => <nav ref={ref} aria-label="breadcrumb" {...props} />,
);
Breadcrumb.displayName = 'Breadcrumb';

export const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.ComponentPropsWithoutRef<'ol'>
>(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn('flex flex-wrap items-center gap-1.5 text-sm text-fg-muted', className)}
    {...props}
  />
));
BreadcrumbList.displayName = 'BreadcrumbList';

export const BreadcrumbItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<'li'>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} className={cn('inline-flex items-center gap-1.5', className)} {...props} />
  ),
);
BreadcrumbItem.displayName = 'BreadcrumbItem';

/** Lien cliquable. `asChild` pour composer avec `next/link`. */
export const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<'a'> & { asChild?: boolean }
>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp
      ref={ref as React.Ref<HTMLAnchorElement>}
      className={cn('transition-colors hover:text-fg', className)}
      {...props}
    />
  );
});
BreadcrumbLink.displayName = 'BreadcrumbLink';

/** Page courante (non cliquable). */
export const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<'span'>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    className={cn('font-medium text-fg', className)}
    {...props}
  />
));
BreadcrumbPage.displayName = 'BreadcrumbPage';

/** Séparateur (chevron par défaut). */
export function BreadcrumbSeparator({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'li'>) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';
