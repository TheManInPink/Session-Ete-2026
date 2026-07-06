/**
 * @file        ai-score-panel.tsx
 * @description Panneau de score de confiance IA (PC-03, AD-02) — jauge circulaire
 *              0-100 + ventilation par facteur. A11y : role="meter" + aria-valuetext.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { cn } from '../../lib/utils';

export interface AiScoreFactor {
  label: string;
  value: number;
}

export interface AiScorePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Score global 0-100. */
  score: number;
  /** Facteurs explicatifs (barres horizontales). */
  breakdown?: AiScoreFactor[];
  /** Seuils de couleur (défaut high=85, medium=60). */
  thresholds?: { high: number; medium: number };
  orientation?: 'vertical' | 'horizontal';
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function colorClass(score: number, t: { high: number; medium: number }): string {
  if (score >= t.high) return 'text-success';
  if (score >= t.medium) return 'text-warning';
  return 'text-destructive';
}

function confidenceLabel(score: number, t: { high: number; medium: number }): string {
  if (score >= t.high) return 'Haute confiance';
  if (score >= t.medium) return 'Confiance moyenne';
  return 'Faible confiance';
}

/** Jauge de score IA + ventilation par facteur. */
export function AiScorePanel({
  score,
  breakdown = [],
  thresholds = { high: 85, medium: 60 },
  orientation = 'vertical',
  className,
  ...props
}: AiScorePanelProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const color = colorClass(clamped, thresholds);
  const label = confidenceLabel(clamped, thresholds);

  return (
    <div
      className={cn(
        'flex gap-6',
        orientation === 'vertical' ? 'flex-col items-center' : 'flex-row items-center',
        className,
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative"
          role="meter"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${label}, ${clamped} sur 100`}
        >
          <svg width={140} height={140} viewBox="0 0 140 140" className={color}>
            <circle
              cx={70}
              cy={70}
              r={RADIUS}
              fill="none"
              strokeWidth={12}
              stroke="currentColor"
              className="text-border"
            />
            <circle
              cx={70}
              cy={70}
              r={RADIUS}
              fill="none"
              strokeWidth={12}
              stroke="currentColor"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform="rotate(-90 70 70)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-bold text-fg">{clamped}</span>
            <span className="text-xs text-fg-muted">/100</span>
          </div>
        </div>
        <span className={cn('text-sm font-semibold', color)}>{label}</span>
      </div>

      {breakdown.length > 0 && (
        <ul className="flex w-full min-w-0 flex-col gap-2">
          {breakdown.map((f) => (
            <li key={f.label} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate text-fg-muted">{f.label}</span>
              <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, f.value))}%` }}
                />
              </span>
              <span className="w-8 text-right font-medium tabular-nums text-fg">{f.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
AiScorePanel.displayName = 'AiScorePanel';
