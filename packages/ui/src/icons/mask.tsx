/**
 * @file        mask.tsx
 * @description Masque dogon (identité culturelle) — line-art stylisé.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { IconBase, type IconProps } from './icon-base';

/** Masque dogon stylisé : visage allongé, yeux en fente, arête nasale. */
export const MaskIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconBase ref={ref} {...props}>
    <path d="M8.5 3h7l.5 7c0 5-2 11-4 11s-4-6-4-11z" />
    <path d="M9 5.5h6" />
    <path d="M10 8.5l1.3 1" />
    <path d="M14 8.5l-1.3 1" />
    <path d="M12 10.5V15" />
  </IconBase>
));
MaskIcon.displayName = 'MaskIcon';
