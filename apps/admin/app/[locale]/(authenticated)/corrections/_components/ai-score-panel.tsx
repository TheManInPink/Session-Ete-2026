/**
 * @file        ai-score-panel.tsx
 * @description Panneau du drawer AD-02 : score IA principal + 3 sous-scores.
 *              Gauge SVG inline (cercle de progression) pour le score global,
 *              barres horizontales pour les sous-scores. 0 dépendance chart.
 *
 * @module      @nina-aes/admin
 */

import { useTranslations } from 'next-intl';
import { cn } from '@nina-aes/ui/lib/utils';
import type { AiSubScores } from '../../../../../lib/mock-corrections';

export function AiScorePanel({
  score,
  verdict,
  subScores,
}: {
  score: number;
  verdict: 'HIGH' | 'MEDIUM' | 'LOW';
  subScores: AiSubScores;
}) {
  const t = useTranslations('admin.corrections.drawer');

  // Couleurs sémantiques alignées sur le design (vert ≥ 80, jaune 50-79, rouge < 50)
  const tone =
    verdict === 'HIGH'
      ? { ring: 'stroke-success-500', text: 'text-success-700', bar: 'bg-success-500' }
      : verdict === 'MEDIUM'
        ? { ring: 'stroke-warning-500', text: 'text-warning-700', bar: 'bg-warning-500' }
        : { ring: 'stroke-destructive', text: 'text-danger-700', bar: 'bg-destructive' };

  return (
    <section className="rounded-base border border-border bg-bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">{t('aiScore')}</h3>

      <div className="flex items-center gap-4">
        {/* Gauge circulaire — radius 28, stroke 6, circonférence ≈ 175.93 */}
        <div className="relative size-20 shrink-0">
          <svg className="-rotate-90" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="28" className="fill-none stroke-bg-muted" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r="28"
              className={cn('fill-none transition-all', tone.ring)}
              strokeWidth="6"
              strokeDasharray={`${(score / 100) * 175.93} 175.93`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-2xl font-bold tabular-nums', tone.text)}>{score}</span>
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">/ 100</span>
          </div>
        </div>

        {/* Sous-scores en barres horizontales */}
        <dl className="flex-1 space-y-2">
          {(['fuzzyMatch', 'consistency', 'agentHistory'] as const).map((key) => {
            const value = subScores[key];
            return (
              <div key={key} className="space-y-0.5">
                <div className="flex items-baseline justify-between text-xs">
                  <dt className="text-fg-muted">{t(`aiScoreSub.${key}`)}</dt>
                  <dd className="font-mono font-medium">{value}</dd>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
                  <div
                    className={cn('h-full transition-all', tone.bar)}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
