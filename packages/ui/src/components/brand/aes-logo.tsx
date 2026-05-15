/**
 * @file        aes-logo.tsx
 * @description Logo NINA-AES — drapeau stylisé bleu profond + N en or.
 *              Neutre politiquement (pas de drapeau d'État spécifique).
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { cn } from '../../lib/utils';

const SIZES = { sm: 24, md: 32, lg: 48, xl: 64 } as const;

export interface AesLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: keyof typeof SIZES;
  /** Affiche le wordmark "NINA-AES" à côté du logo (true par défaut). */
  showText?: boolean;
}

export function AesLogo({ size = 'md', showText = true, className, ...props }: AesLogoProps) {
  const dim = SIZES[size];
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      aria-label="NINA-AES"
      {...props}
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 48 48"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        {/* Carré bleu profond AES (souveraineté) */}
        <rect x="0" y="0" width="48" height="48" rx="8" fill="hsl(213, 65%, 32%)" />
        {/* N stylisé en or (identité numérique) */}
        <path
          d="M12 36 L12 12 L20 12 L28 28 L28 12 L36 12 L36 36 L28 36 L20 20 L20 36 Z"
          fill="hsl(48, 100%, 53%)"
        />
      </svg>
      {showText && (
        <span className="text-base font-bold tracking-tight">
          NINA<span className="text-primary">-AES</span>
        </span>
      )}
    </span>
  );
}
