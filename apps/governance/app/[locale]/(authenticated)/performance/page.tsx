/**
 * @file        (authenticated)/performance/page.tsx
 * @description GOV — Performance institutionnelle. Traçabilité et réactivité par
 *              institution : KPIs, institutions extrêmes (moins / mieux traçable)
 *              et classement complet. Réutilise IntegrityGauge (score de
 *              traçabilité) + Sparkline (tendance) du design system.
 *
 *              CONTRAT HONNÊTE : `fetchInstitutionPerformance()` vaut `null` en
 *              mode live (governance-service n'expose pas encore d'agrégation de
 *              performance, doc 22) → EmptyState ; en mode mock, un jeu
 *              déterministe (`lib/performance/institutions`).
 *
 * @module      @nina-aes/governance
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { Alert, AlertDescription } from '@nina-aes/ui/components/alert';
import { EmptyState } from '@nina-aes/ui/components/empty-state';
import { Sparkline } from '@nina-aes/ui/components/charts/sparkline';
import { IntegrityGauge } from '@nina-aes/ui/components/charts/integrity-gauge';
import { cn } from '@nina-aes/ui/lib/utils';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { requireRole } from '../../../../lib/auth/session';
import { fetchInstitutionPerformance } from '../../../../lib/api/server';
import { traceBandFor, type TraceBand } from '../../../../lib/performance/institutions';

interface PageProps {
  params: Promise<{ locale: string }>;
}

function bandText(b: TraceBand): string {
  return b === 'good' ? 'text-success-700' : b === 'watch' ? 'text-warning-700' : 'text-danger-700';
}

function sparkTone(b: TraceBand): 'success' | 'warning' | 'danger' {
  return b === 'good' ? 'success' : b === 'watch' ? 'warning' : 'danger';
}

function ScoreBar({ value, band }: { value: number; band: TraceBand }) {
  const bar =
    band === 'good' ? 'bg-success-500' : band === 'watch' ? 'bg-warning-500' : 'bg-destructive';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-muted">
      <div className={cn('h-full rounded-full', bar)} style={{ width: `${value}%` }} />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-base border border-border bg-bg-card p-3">
      <div className="flex items-center gap-1.5 text-fg-muted">
        <Icon className="size-4" aria-hidden={true} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone ?? 'text-fg')}>{value}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-base bg-bg-muted/50 p-2">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={cn('mt-0.5 font-semibold tabular-nums', tone ?? 'text-fg')}>{value}</p>
    </div>
  );
}

export default async function GovernancePerformancePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(['SUPERVISOR', 'ADMIN']);
  const t = await getTranslations('governance.performance');

  const overview = fetchInstitutionPerformance();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
      </header>

      {overview == null ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              icon={BarChart3}
              title={t('unavailable.title')}
              description={t('unavailable.body')}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              icon={Building2}
              label={t('kpis.institutions')}
              value={String(overview.totals.institutions)}
            />
            <StatTile
              icon={CheckCircle2}
              label={t('kpis.avgCompletion')}
              value={`${overview.totals.avgCompletion} %`}
            />
            <StatTile
              icon={Clock}
              label={t('kpis.avgResponse')}
              value={t('days', { n: overview.totals.avgResponseDays })}
            />
            <StatTile
              icon={AlertTriangle}
              label={t('kpis.overdue')}
              value={String(overview.totals.overdue)}
              tone={overview.totals.overdue > 0 ? 'text-danger-700' : 'text-fg'}
            />
          </section>

          {/* ── Bandeau démo (honnêteté) ─────────────────────────────────── */}
          <Alert variant="info">
            <AlertDescription>{t('demoBanner')}</AlertDescription>
          </Alert>

          {/* ── Institutions extrêmes ────────────────────────────────────── */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[
              {
                key: 'least',
                title: t('highlight.least'),
                inst: overview.leastTraceable,
                danger: true,
              },
              {
                key: 'most',
                title: t('highlight.most'),
                inst: overview.mostTraceable,
                danger: false,
              },
            ].map(({ key, title, inst, danger }) =>
              inst ? (
                <Card
                  key={key}
                  className={cn(
                    'border-l-4',
                    danger ? 'border-l-destructive' : 'border-l-success-500',
                  )}
                >
                  <CardHeader className="pb-2">
                    <CardDescription>{title}</CardDescription>
                    <CardTitle className="text-xl">{inst.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <IntegrityGauge name={inst.shortName} score={inst.traceabilityScore} />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Metric
                        label={t('highlight.overdueLabel')}
                        value={String(inst.overdue)}
                        tone={inst.overdue > 0 ? 'text-danger-700' : undefined}
                      />
                      <Metric
                        label={t('highlight.escalationsLabel')}
                        value={String(inst.escalations)}
                      />
                      <Metric
                        label={t('highlight.responseLabel')}
                        value={t('days', { n: inst.avgResponseDays })}
                      />
                    </div>
                  </CardContent>
                </Card>
              ) : null,
            )}
          </section>

          {/* ── Classement complet ───────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>{t('table.title')}</CardTitle>
              <CardDescription>{t('table.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-fg-muted">
                      <th className="px-6 py-2 font-medium">{t('table.institution')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('table.directives')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('table.completion')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('table.response')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('table.overdue')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('table.escalations')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.traceability')}</th>
                      <th className="px-6 py-2 font-medium">{t('table.trend')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview.institutions.map((inst) => {
                      const band = traceBandFor(inst.traceabilityScore);
                      const isLeast = inst.id === overview.leastTraceable?.id;
                      return (
                        <tr key={inst.id} className={cn(isLeast && 'bg-danger-50/40')}>
                          <td className="px-6 py-3">
                            <p className="font-medium">{inst.shortName}</p>
                            <p className="text-xs text-fg-muted">{inst.name}</p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{inst.directives}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {inst.completionRate} %
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {t('days', { n: inst.avgResponseDays })}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-3 text-right tabular-nums',
                              inst.overdue > 0 && 'text-danger-700',
                            )}
                          >
                            {inst.overdue}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{inst.escalations}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24">
                                <ScoreBar value={inst.traceabilityScore} band={band} />
                              </div>
                              <span
                                className={cn(
                                  'w-8 text-right font-mono text-xs font-semibold tabular-nums',
                                  bandText(band),
                                )}
                              >
                                {inst.traceabilityScore}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="h-8 w-24">
                              <Sparkline
                                data={inst.trend}
                                tone={sparkTone(band)}
                                ariaLabel={`${inst.shortName} — tendance de traçabilité`}
                                className="h-8"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
