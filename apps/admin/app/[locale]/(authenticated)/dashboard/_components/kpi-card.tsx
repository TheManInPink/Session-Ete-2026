/**
 * @file        kpi-card.tsx
 * @description Carte KPI réutilisable — gros chiffre + delta % vs semaine
 *              précédente + sparkline 30j. Click optionnel pour drill-down.
 *              Consomme le modèle de vue `KpiSnapshotView` (contrat
 *              `AdminKpiSnapshot` de @nina-aes/api-client + concerns de vue,
 *              cf. lib/dashboard/view-model.ts).
 *
 * @module      @nina-aes/admin
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@nina-aes/ui/components/card';
import { Sparkline } from '@nina-aes/ui/components/charts/sparkline';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { KpiSnapshotView } from '../../../../../lib/dashboard/view-model';

export function KpiCard({ snapshot, locale }: { snapshot: KpiSnapshotView; locale: string }) {
  const t = useTranslations('admin.dashboard.kpis');
  const positiveIsGood = snapshot.key !== 'correctionsPending' && snapshot.key !== 'alertsOpen';
  const isUp = snapshot.weekDelta > 0;
  const isGood = positiveIsGood ? isUp : !isUp;

  const inner = (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          {t(snapshot.key)}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {snapshot.value.toLocaleString('fr-FR')}
        </p>
        <div className="mt-1 flex items-center gap-1 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              isGood ? 'text-success-700' : 'text-danger-700',
            )}
          >
            {isUp ? (
              <ArrowUpRight className="size-3" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="size-3" aria-hidden="true" />
            )}
            {isUp ? '+' : ''}
            {snapshot.weekDelta.toFixed(1)} %
          </span>
          <span className="text-fg-muted">{t('deltaWeek')}</span>
        </div>
        <div className="mt-3 h-10">
          <Sparkline data={snapshot.history} tone={snapshot.tone} />
        </div>
      </CardContent>
    </Card>
  );

  if (snapshot.drillTo) {
    return (
      <Link
        href={`/${locale}/${snapshot.drillTo}`}
        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`${t(snapshot.key)} — drill down`}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
