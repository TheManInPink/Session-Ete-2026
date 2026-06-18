/**
 * @file        baobab.tsx
 * @description Baobab (sagesse / patrimoine) — line-art stylisé.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { IconBase, type IconProps } from './icon-base';

/** Baobab stylisé : large couronne aplatie + tronc épais. */
export const BaobabIcon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <IconBase ref={ref} {...props}>
    <path d="M4.5 8.5C4.5 5.5 8 4 12 4s7.5 1.5 7.5 4.5c0 1.9-2.2 2.3-4.3 2.3H8.8c-2.1 0-4.3-.4-4.3-2.3z" />
    <path d="M12 10.8V5" />
    <path d="M10 10.8V20" />
    <path d="M14 10.8V20" />
    <path d="M7 20h10" />
  </IconBase>
));
BaobabIcon.displayName = 'BaobabIcon';
