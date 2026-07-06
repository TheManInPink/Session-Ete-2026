/**
 * @file        pagination.tsx
 * @description Pagination NINA-AES — composé, réutilise buttonVariants.
 *              A11y : nav aria-label, aria-current="page" sur la page active.
 * @module      @nina-aes/ui
 */

import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { buttonVariants } from './button';

export function Pagination({ className, ...props }: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}
Pagination.displayName = 'Pagination';

export const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<'ul'>
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
));
PaginationContent.displayName = 'PaginationContent';

export const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<'li'>>(
  (props, ref) => <li ref={ref} {...props} />,
);
PaginationItem.displayName = 'PaginationItem';

type PaginationLinkProps = {
  isActive?: boolean;
  size?: 'sm' | 'md' | 'icon';
} & React.ComponentPropsWithoutRef<'a'>;

/** Lien de page (actif = variant outline + aria-current). */
export function PaginationLink({
  className,
  isActive,
  size = 'icon',
  ...props
}: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      className={cn(buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }), className)}
      {...props}
    />
  );
}
PaginationLink.displayName = 'PaginationLink';

export function PaginationPrevious({ className, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  return (
    <PaginationLink
      aria-label="Aller à la page précédente"
      size="md"
      className={cn('gap-1 pl-2.5', className)}
      {...props}
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      <span>Précédent</span>
    </PaginationLink>
  );
}
PaginationPrevious.displayName = 'PaginationPrevious';

export function PaginationNext({ className, ...props }: React.ComponentPropsWithoutRef<'a'>) {
  return (
    <PaginationLink
      aria-label="Aller à la page suivante"
      size="md"
      className={cn('gap-1 pr-2.5', className)}
      {...props}
    >
      <span>Suivant</span>
      <ChevronRight className="size-4" aria-hidden="true" />
    </PaginationLink>
  );
}
PaginationNext.displayName = 'PaginationNext';

export function PaginationEllipsis({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">Plus de pages</span>
    </span>
  );
}
PaginationEllipsis.displayName = 'PaginationEllipsis';
