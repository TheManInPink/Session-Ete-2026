/**
 * @file        hornbill.tsx
 * @description Calao (communication) — line-art stylisé : tête + grand bec courbe.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { IconBase, type IconProps } from './icon-base';

/** Calao stylisé : tête arrondie, casque et bec recourbé caractéristiques. */
export const HornbillIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconBase ref={ref} {...props}>
    <path d="M4 12c0-4.4 3.6-8 8-8 2.2 0 4.2.9 5.7 2.3" />
    <path d="M17.7 6.3c2.3.6 3.8 2.1 3.3 3.7-1.6-.3-3.1.1-4.4.9" />
    <path d="M16.6 10.9c1 .6 1.4 1.6.2 2.2" />
    <path d="M4 12c0 3.3 2 6.2 5 7.4" />
    <circle cx="10.5" cy="8" r="0.8" fill="currentColor" stroke="none" />
  </IconBase>
));
HornbillIcon.displayName = 'HornbillIcon';
