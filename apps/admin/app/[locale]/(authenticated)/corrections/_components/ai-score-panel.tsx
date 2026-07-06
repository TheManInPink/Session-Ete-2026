/**
 * @file        ai-score-panel.tsx
 * @description Panneau du drawer AD-02 : score de confiance IA global.
 *              Gauge SVG inline (cercle de progression), 0 dépendance chart.
 *
 *              Dégradation HONNÊTE : le backend ne persiste que `aiScore`
 *              (0-100) et `aiVerdict` (HIGH | MEDIUM | LOW). Les anciens
 *              sous-scores détaillés (fuzzyMatch / consistency / agentHistory)
 *              n'avaient AUCUNE source réelle — ils ont été retirés plutôt
 *              qu'inventés. Un score `null` = demande pas encore analysée par
 *              ai-service : le panneau l'affiche explicitement.
 *
 * @module      @nina-aes/admin
 */

import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { AiVerdict } from '@nina-aes/api-client';

/**
 * Libellés FR des verdicts — l'échelle publique (HIGH | MEDIUM | LOW) est figée
 * par le contrat api-client ; pas de clé i18n dédiée à ce jour.
 */
const VERDICT_LABELS: Record<AiVerdict, string> = {
  HIGH: 'Confiance élevée',
  MEDIUM: 'Confiance moyenne',
  LOW: 'Confiance faible',
};

export function AiScorePanel({
  score,
  verdict,
}: {
  /** Score de confiance IA 0-100 — `null` si non encore analysé. */
  score: number | null;
  verdict: AiVerdict | null;
}) {
  const t = useTranslations('admin.corrections.drawer');

  // État dégradé : aucune analyse IA persistée pour cette demande.
  if (score === null) {
    return (
      <section className="rounded-base border border-dashed border-border bg-bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">{t('aiScore')}</h3>
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          Analyse IA non encore disponible pour cette demande.
        </p>
      </section>
    );
  }

  // Couleurs sémantiques alignées sur le design (vert HIGH, jaune MEDIUM, rouge LOW)
  const tone =
    verdict === 'HIGH'
      ? { ring: 'stroke-success-500', text: 'text-success-700' }
      : verdict === 'MEDIUM'
        ? { ring: 'stroke-warning-500', text: 'text-warning-700' }
        : { ring: 'stroke-destructive', text: 'text-danger-700' };

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
            <span className={cn('text-2xl font-bold tabular-nums', tone.text)}>
              {Math.round(score)}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">/ 100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', tone.text)}>
            {verdict ? VERDICT_LABELS[verdict] : '—'}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Score global calculé par ai-service — aucun sous-score détaillé n&apos;est persisté par
            le backend.
          </p>
        </div>
      </div>
    </section>
  );
}
