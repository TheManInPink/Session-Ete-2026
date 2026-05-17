/**
 * @file        sparkline.tsx
 * @description Sparkline SVG inline minimal — courbe + area fill optionnel
 *              + dernier point mis en évidence. Aucune dépendance, viewBox
 *              `0 0 100 30` pour s'adapter à n'importe quelle largeur.
 *
 *              Usage : KPI cards AD-01 (taille typique 120×40 px).
 *
 *              Accessibilité : `<svg role="img">` avec `aria-label` qui
 *              résume la tendance (« 30 derniers jours : N à M »).
 *
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { cn } from '../../lib/utils.js';

export interface SparklineProps {
  /** Séquence de valeurs numériques. Min 2 points pour tracer une ligne. */
  data: readonly number[];
  /**
   * Tonalité — détermine la couleur du trait + de l'aire :
   *   primary  : bleu AES   (`hsl(212 70 % 45 %)`)
   *   success  : vert        (`hsl(141 70 % 40 %)`)
   *   warning  : ambre       (`hsl(38 90 % 50 %)`)
   *   danger   : rouge       (`hsl(2 70 % 50 %)`)
   *   muted    : gris foncé  (`hsl(220 10 % 40 %)`)
   */
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'muted';
  /** Affiche l'aire sous la courbe (gradient soft). Défaut : true. */
  fill?: boolean;
  /** Met en évidence le dernier point d'un cercle plein. Défaut : true. */
  highlightLast?: boolean;
  /** Label accessible — affiché en `<title>`. */
  ariaLabel?: string;
  className?: string;
}

const TONES: Record<NonNullable<SparklineProps['tone']>, string> = {
  primary: 'hsl(212 70% 45%)',
  success: 'hsl(141 70% 40%)',
  warning: 'hsl(38 90% 50%)',
  danger: 'hsl(2 70% 50%)',
  muted: 'hsl(220 10% 40%)',
};

export function Sparkline({
  data,
  tone = 'primary',
  fill = true,
  highlightLast = true,
  ariaLabel,
  className,
}: SparklineProps) {
  if (data.length < 2) return null;

  const color = TONES[tone];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // ViewBox 100 × 30, padding vertical 2 pour éviter le clipping du marker
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 28 - ((v - min) / range) * 26;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');

  const last = points[points.length - 1]!;

  const accessibleLabel =
    ariaLabel ?? `Tendance ${data.length} derniers points : ${min} à ${max}`;

  return (
    <svg
      viewBox="0 0 100 30"
      role="img"
      aria-label={accessibleLabel}
      preserveAspectRatio="none"
      className={cn('h-auto w-full', className)}
    >
      <title>{accessibleLabel}</title>

      {fill && (
        <path
          d={`${linePath} L100,30 L0,30 Z`}
          fill={color}
          fillOpacity="0.15"
        />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {highlightLast && (
        <circle cx={last.x} cy={last.y} r="1.6" fill={color} />
      )}
    </svg>
  );
}
