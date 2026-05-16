/**
 * @file        area-chart.tsx
 * @description Area chart SVG inline avec axes minimum (Y left, X bottom),
 *              gridlines horizontales, et un tooltip natif au hover sur
 *              chaque point. Zéro dépendance lib.
 *
 *              Usage : « Corrections / jour sur 30j » en AD-01.
 *
 *              Limites assumées :
 *                - Pas de zoom / pan (pour ça → recharts dans un Session 5+).
 *                - Pas de tooltip riche flottant — on s'appuie sur le `<title>`
 *                  natif SVG. Suffisant pour un dashboard de monitoring.
 *
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface AreaChartPoint {
  /** Label X (ex: '14/05', 'Lun', ...). */
  x: string;
  /** Valeur Y. */
  y: number;
}

export interface AreaChartProps {
  data: readonly AreaChartPoint[];
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  /** Nombre de gridlines horizontales (entre 2 et 6). Défaut : 4. */
  gridSteps?: number;
  /** Affiche les labels X tous les `xLabelEvery` points. Défaut : 5. */
  xLabelEvery?: number;
  /** Hauteur du SVG en pixels. Largeur = 100 % du parent. */
  height?: number;
  ariaLabel?: string;
  className?: string;
}

const TONES = {
  primary: { stroke: 'hsl(212 70% 45%)', fill: 'hsl(212 70% 45% / 0.18)' },
  success: { stroke: 'hsl(141 70% 40%)', fill: 'hsl(141 70% 40% / 0.18)' },
  warning: { stroke: 'hsl(38 90% 50%)', fill: 'hsl(38 90% 50% / 0.18)' },
  danger: { stroke: 'hsl(2 70% 50%)', fill: 'hsl(2 70% 50% / 0.18)' },
};

export function AreaChart({
  data,
  tone = 'primary',
  gridSteps = 4,
  xLabelEvery = 5,
  height = 200,
  ariaLabel,
  className,
}: AreaChartProps) {
  if (data.length < 2) return null;

  const colors = TONES[tone];
  const min = 0;
  const max = Math.max(1, ...data.map((d) => d.y));
  const range = max - min || 1;

  // ViewBox : padding gauche 35 (labels Y), bas 18 (labels X), droite 6, haut 4
  const VB = { w: 400, h: 200, left: 35, right: 6, top: 4, bottom: 18 };
  const innerW = VB.w - VB.left - VB.right;
  const innerH = VB.h - VB.top - VB.bottom;

  const points = data.map((d, i) => ({
    x: VB.left + (i / (data.length - 1)) * innerW,
    y: VB.top + (1 - (d.y - min) / range) * innerH,
    raw: d,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  const areaPath = `${linePath} L${points[points.length - 1]!.x},${VB.top + innerH} L${points[0]!.x},${VB.top + innerH} Z`;

  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => {
    const v = min + (range * i) / gridSteps;
    return {
      value: v,
      y: VB.top + (1 - i / gridSteps) * innerH,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      role="img"
      aria-label={ariaLabel ?? `Évolution sur ${data.length} points`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={cn('h-auto max-w-full', className)}
    >
      <title>{ariaLabel ?? `Évolution sur ${data.length} points`}</title>

      {/* Gridlines + Y labels */}
      {gridValues.map((g) => (
        <g key={g.value}>
          <line
            x1={VB.left}
            x2={VB.w - VB.right}
            y1={g.y}
            y2={g.y}
            stroke="var(--border)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
          <text
            x={VB.left - 4}
            y={g.y + 3}
            fontSize="9"
            textAnchor="end"
            fill="var(--fg-muted)"
          >
            {Math.round(g.value)}
          </text>
        </g>
      ))}

      {/* Area + line */}
      <path d={areaPath} fill={colors.fill} />
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* Points interactifs */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="2.5"
            fill="var(--bg-card)"
            stroke={colors.stroke}
            strokeWidth="1.2"
            className="transition-all"
          />
          <title>{`${p.raw.x} : ${p.raw.y}`}</title>
        </g>
      ))}

      {/* X labels */}
      {points.map((p, i) => {
        if (i % xLabelEvery !== 0 && i !== points.length - 1) return null;
        return (
          <text
            key={`xlbl-${i}`}
            x={p.x}
            y={VB.h - 4}
            fontSize="9"
            textAnchor="middle"
            fill="var(--fg-muted)"
          >
            {p.raw.x}
          </text>
        );
      })}
    </svg>
  );
}
