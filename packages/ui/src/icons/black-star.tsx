/**
 * @file        black-star.tsx
 * @description Étoile noire AES (panafricanisme). Icône pleine (`currentColor`).
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { IconBase, type IconProps } from './icon-base';

/** Étoile noire — symbole panafricain de l'Alliance des États du Sahel. */
export const BlackStarIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconBase ref={ref} fill="currentColor" stroke="none" {...props}>
    <path d="M12 2l2.94 6.36 6.96.72-5.2 4.66 1.46 6.84L12 17.77l-6.16 3.21 1.46-6.84-5.2-4.66 6.96-.72z" />
  </IconBase>
));
BlackStarIcon.displayName = 'BlackStarIcon';
