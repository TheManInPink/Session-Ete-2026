/**
 * @file        (authenticated)/rapports/page.tsx
 * @description GOV — Rapports. Synthèses mensuelles de gouvernance : rapport
 *              vedette (dernier publié) avec KPIs + « institutions les moins
 *              traçables » (réutilise le classement de `lib/performance`), puis
 *              la liste de tous les rapports mensuels.
 *
 *              CONTRAT HONNÊTE : `fetchGovernanceReports()` vaut `null` en mode
 *              live (governance-service ne génère pas encore de rapports, doc 22)
 *              → EmptyState ; en mode mock, un jeu déterministe. La génération
 *              PDF signée n'étant pas branchée, les téléchargements sont
 *              désactivés (note explicite).
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
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Alert, AlertDescription } from '@nina-aes/ui/components/alert';
import { EmptyState } from '@nina-aes/ui/components/empty-state';
import { cn } from '@nina-aes/ui/lib/utils';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { requireRole } from '../../../../lib/auth/session';
import { fetchGovernanceReports } from '../../../../lib/api/server';
import { traceBandFor, type TraceBand } from '../../../../lib/performance/institutions';
import type { ReportStatus } from '../../../../lib/reports/monthly';

interface PageProps {
  params: Promise<{ locale: string }>;
}

const STATUS_VARIANT: Record<ReportStatus, 'success' | 'warning'> = {
  PUBLISHED: 'success',
  DRAFT: 'warning',
};

function bandText(b: TraceBand): string {
  return b === 'good' ? 'text-success-700' : b === 'watch' ? 'text-warning-700' : 'text-danger-700';
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

export default async function GovernanceRapportsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(['SUPERVISOR', 'ADMIN']);
  const t = await getTranslations('governance.rapports');

  const overview = fetchGovernanceReports();

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
              icon={FileText}
              title={t('unavailable.title')}
              description={t('unavailable.body')}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Bandeau démo (honnêteté) ─────────────────────────────────── */}
          <Alert variant="info">
            <AlertDescription>{t('demoBanner')}</AlertDescription>
          </Alert>

          {/* ── Rapport vedette (dernier publié) ─────────────────────────── */}
          {overview.featured && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardDescription>{t('featured.label')}</CardDescription>
                  <div className="mt-0.5 flex items-center gap-2">
                    <CardTitle className="text-2xl">{overview.featured.periodLabel}</CardTitle>
                    <Badge variant={STATUS_VARIANT[overview.featured.status]} size="sm">
                      {t(`status.${overview.featured.status}`)}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Button variant="solid" size="sm" disabled>
                    <Download className="size-4" aria-hidden="true" />
                    {t('download')}
                  </Button>
                  <span className="max-w-[220px] text-right text-xs text-fg-muted">
                    {t('downloadPending')}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* KPIs du mois */}
                <div className="grid grid-cols-2 gap-3">
                  <StatTile
                    icon={FileText}
                    label={t('featured.directives')}
                    value={String(overview.featured.directivesProcessed)}
                  />
                  <StatTile
                    icon={CheckCircle2}
                    label={t('featured.completion')}
                    value={`${overview.featured.completionRate} %`}
                  />
                  <StatTile
                    icon={AlertTriangle}
                    label={t('featured.alerts')}
                    value={String(overview.featured.institutionsInAlert)}
                    tone={overview.featured.institutionsInAlert > 0 ? 'text-danger-700' : 'text-fg'}
                  />
                  <StatTile
                    icon={Clock}
                    label={t('featured.response')}
                    value={`${overview.featured.avgResponseDays} j`}
                  />
                </div>

                {/* Institutions les moins traçables */}
                <div>
                  <p className="text-sm font-medium">{t('leastTraceable.title')}</p>
                  <p className="mb-3 mt-0.5 text-xs text-fg-muted">
                    {t('leastTraceable.subtitle')}
                  </p>
                  <ul className="space-y-2.5">
                    {overview.leastTraceable.map((inst) => {
                      const band = traceBandFor(inst.traceabilityScore);
                      return (
                        <li key={inst.id}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              <Building2 className="size-3.5 text-fg-muted" aria-hidden="true" />
                              {inst.shortName}
                            </span>
                            <span
                              className={cn(
                                'font-mono text-xs font-semibold tabular-nums',
                                bandText(band),
                              )}
                            >
                              {inst.traceabilityScore}
                            </span>
                          </div>
                          <div className="mt-1">
                            <ScoreBar value={inst.traceabilityScore} band={band} />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-fg-muted">{inst.name}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Liste des rapports mensuels ──────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>{t('list.title')}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-fg-muted">
                      <th className="px-6 py-2 font-medium">{t('list.period')}</th>
                      <th className="px-3 py-2 font-medium">{t('list.status')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('list.directives')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('list.completion')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('list.alerts')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('list.pages')}</th>
                      <th className="px-6 py-2 text-right font-medium">{t('list.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview.reports.map((r) => (
                      <tr key={r.id}>
                        <td className="px-6 py-3 font-medium">{r.periodLabel}</td>
                        <td className="px-3 py-3">
                          <Badge variant={STATUS_VARIANT[r.status]} size="sm">
                            {t(`status.${r.status}`)}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.directivesProcessed}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.completionRate} %</td>
                        <td
                          className={cn(
                            'px-3 py-3 text-right tabular-nums',
                            r.institutionsInAlert > 0 && 'text-danger-700',
                          )}
                        >
                          {r.institutionsInAlert}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.pages} p.</td>
                        <td className="px-6 py-3 text-right">
                          {r.status === 'PUBLISHED' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              aria-label={`${t('download')} — ${r.periodLabel}`}
                            >
                              <Download className="size-4" aria-hidden="true" />
                            </Button>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
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
