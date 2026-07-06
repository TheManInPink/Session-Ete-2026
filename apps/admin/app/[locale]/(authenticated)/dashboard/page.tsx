/**
 * @file        dashboard/page.tsx
 * @description AD-01 — Dashboard agent CTDEC.
 *              Server component branché sur `fetchAdminDashboardStats()`
 *              (lib/api/server → `api.adminDashboard.getStats()`), adapté par
 *              lib/dashboard/view-model.
 *
 *              CONTRAT HONNÊTE : chaque section du contrat
 *              `AdminDashboardStats` peut valoir `null` (aucune source
 *              backend — agrégation Bloc D non implémentée). Dans ce cas la
 *              page rend une `UnavailableCard` explicite, jamais un zéro
 *              menteur. En mode live, seuls les compteurs dérivables des
 *              services existants (corrections en attente / du jour) sont
 *              remplis.
 *
 * @module      @nina-aes/admin
 */

import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { Skeleton } from '@nina-aes/ui/components/skeleton';
import { AreaChart } from '@nina-aes/ui/components/charts/area-chart';
import { MaliHeatmap } from '@nina-aes/ui/components/charts/mali-heatmap';
// GeoJSON polygons admin level 1 du Mali (geoBoundaries gbOpen, 9 régions
// historiques pré-2016 — couvre 100 % du territoire). Cf. data/mali/README
// pour la provenance et le mapping codes shapeISO → ML-NN.
import maliPolygons from '../../../../../../data/mali/mali-regions-polygons.json';
import { requireRole } from '../../../../lib/auth/session';
import { fetchAdminDashboardStats } from '../../../../lib/api/server';
import { toAreaChartData, toHeatmapData, toKpiViews } from '../../../../lib/dashboard/view-model';
import { UnavailableCard } from '../../../../components/unavailable-card';
import { KpiCard } from './_components/kpi-card';
import { AlertsFeed } from './_components/alerts-feed';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);
  const t = await getTranslations('admin.dashboard');
  const stats = await fetchAdminDashboardStats();
  // Référence temporelle stable pour les feeds — figée côté serveur, passée
  // aux client components pour éviter les hydration mismatch sur les
  // formatages relatifs (next-intl format.relativeTime). Cf. doc next-intl :
  // https://next-intl.dev/docs/usage/dates-times#relative-times-usenow
  const now = new Date().toISOString();

  const kpiViews = stats.kpis ? toKpiViews(stats.kpis) : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          {t('greeting', { name: session.user.name.split(' ')[0] ?? 'Agent' })}
        </h1>
        <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
      </header>

      {/* ── KPI cards ──────────────────────────────────────────────────── */}
      <section aria-labelledby="kpis-title">
        <h2 id="kpis-title" className="sr-only">
          {t('kpis.title')}
        </h2>
        {kpiViews ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpiViews.map((snapshot) => (
              <KpiCard key={snapshot.key} snapshot={snapshot} locale={locale} />
            ))}
          </div>
        ) : (
          // Pas d'historisation Bloc D : on n'affiche QUE les compteurs
          // réellement dérivables des services livrés (sans sparkline ni delta).
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.correctionsPending !== null && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                    {t('kpis.correctionsPending')}
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {stats.correctionsPending.toLocaleString('fr-FR')}
                  </p>
                </CardContent>
              </Card>
            )}
            {stats.correctionsToday !== null && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                    Corrections soumises aujourd&apos;hui
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {stats.correctionsToday.toLocaleString('fr-FR')}
                  </p>
                </CardContent>
              </Card>
            )}
            <UnavailableCard
              className="sm:col-span-2"
              title="Indicateurs historisés indisponibles"
              body="Sparklines 30 jours, variations hebdo et compteurs NINA / RDV / alertes seront fournis par le backend d'agrégation (Bloc D à venir)."
            />
          </div>
        )}
      </section>

      {/* ── AreaChart + Feed (2 colonnes desktop) ──────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {stats.correctionsPerDay ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('correctionsChartTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaChart
                data={toAreaChartData(stats.correctionsPerDay)}
                tone="warning"
                height={220}
                ariaLabel={t('correctionsChartAria')}
              />
            </CardContent>
          </Card>
        ) : (
          <UnavailableCard
            className="lg:col-span-2"
            title={t('correctionsChartTitle')}
            body="La série corrections / jour sera fournie par le backend d'agrégation (Bloc D à venir)."
          />
        )}

        {stats.alerts ? (
          <Suspense fallback={<Skeleton className="h-80 w-full" />}>
            <AlertsFeed initialAlerts={stats.alerts} locale={locale} now={now} />
          </Suspense>
        ) : (
          <UnavailableCard
            title={t('alertsFeedTitle')}
            body="Le flux temps réel des alertes SIGAC (SSE anticorruption-service) sera branché avec le Bloc D à venir."
          />
        )}
      </section>

      {/* ── MaliHeatmap activité régionale ─────────────────────────────── */}
      <section>
        {stats.activityByRegion ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('activityMapTitle')}</CardTitle>
              <CardDescription>{t('activityMapSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <MaliHeatmap
                data={toHeatmapData(stats.activityByRegion)}
                geojson={maliPolygons as Parameters<typeof MaliHeatmap>[0]['geojson']}
                tone="sequential"
                width={720}
                ariaLabel={t('activityMapAria')}
              />
            </CardContent>
          </Card>
        ) : (
          <UnavailableCard
            title={t('activityMapTitle')}
            body="L'agrégation régionale des corrections sera fournie par le backend Bloc D à venir."
          />
        )}
      </section>
    </div>
  );
}
