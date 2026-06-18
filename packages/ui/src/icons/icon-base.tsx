/**
 * @file        icon-base.tsx
 * @description Base SVG des icônes maliennes custom — API alignée sur Lucide
 *              (currentColor, stroke-width 1.5, viewBox 24). cf. design-system.md §2.7.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  /** Taille en px (applique width ET height). Défaut 24. */
  size?: number | string;
}

/** Enveloppe SVG commune (souveraineté visuelle : aucune dépendance externe). */
export const IconBase = React.forwardRef<SVGSVGElement, IconProps & { children: React.ReactNode }>(
  ({ size = 24, strokeWidth = 1.5, children, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  ),
);
IconBase.displayName = 'IconBase';
