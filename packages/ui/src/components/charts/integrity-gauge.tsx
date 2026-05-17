/**
 * @file        integrity-gauge.tsx
 * @description Jauge d'intégrité agent : barre horizontale avec couleur
 *              sémantique selon le score (≥80 vert, 50-79 ambre, <50 rouge).
 *              Utilisée dans le top 10 agents AD-03 SIGAC.
 *
 *              Compose avec un nom + un score affiché.
 *
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface IntegrityGaugeProps {
  /** Nom affichable de l'agent. */
  name: string;
  /** Score 0-100. */
  score: number;
  /** Affiche une icône check/x à gauche selon score ≥/< 70. Défaut : true. */
  withVerdictIcon?: boolean;
  className?: string;
}

export function IntegrityGauge({
  name,
  score,
  withVerdictIcon = true,
  className,
}: IntegrityGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone =
    clamped >= 80
      ? { bar: 'bg-success-500', text: 'text-success-700', label: 'Bon' }
      : clamped >= 50
        ? { bar: 'bg-warning-500', text: 'text-warning-700', label: 'À surveiller' }
        : { bar: 'bg-destructive', text: 'text-danger-700', label: 'Critique' };
  const okIcon = clamped >= 70;

  return (
    <div
      className={cn('flex items-center gap-3', className)}
      role="group"
      aria-label={`${name} : ${clamped}/100 (${tone.label})`}
    >
      {withVerdictIcon && (
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full',
            okIcon ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700',
          )}
          aria-hidden="true"
        >
          {okIcon ? <Check className="size-3" /> : <X className="size-3" />}
        </span>
      )}
      <span className="w-32 shrink-0 truncate text-sm font-medium" title={name}>
        {name}
      </span>
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-bg-muted">
        <div className={cn('h-full transition-all', tone.bar)} style={{ width: `${clamped}%` }} />
      </div>
      <span
        className={cn(
          'w-10 shrink-0 text-right font-mono text-sm font-medium tabular-nums',
          tone.text,
        )}
      >
        {clamped}
      </span>
    </div>
  );
}
