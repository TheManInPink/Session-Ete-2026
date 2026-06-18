/**
 * @file        kola-nut.tsx
 * @description Noix de kola (partage / hospitalité) — line-art stylisé.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { IconBase, type IconProps } from './icon-base';

/** Noix de kola stylisée : deux cotylédons séparés par un sillon central. */
export const KolaNutIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconBase ref={ref} {...props}>
    <path d="M12 3.5c-3.6 0-6 3.4-6 8.5s2.4 8.5 6 8.5 6-3.4 6-8.5-2.4-8.5-6-8.5z" />
    <path d="M12 3.5v17" />
    <path d="M9.5 12h5" />
  </IconBase>
));
KolaNutIcon.displayName = 'KolaNutIcon';
