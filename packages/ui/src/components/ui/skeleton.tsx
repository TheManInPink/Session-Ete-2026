/**
 * @file        skeleton.tsx
 * @description Skeleton loader NINA-AES — annonce le chargement aux lecteurs
 *              d'écran via `aria-busy="true"`.
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { cn } from '../../lib/utils.js';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn('animate-pulse rounded-base bg-bg-muted', className)}
      {...props}
    />
  );
}
