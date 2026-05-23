/**
 * @file        dashboard/page.tsx
 * @description AD-01 — Dashboard agent CTDEC.
 *              4 KPI cards (NINA actifs, corrections en attente, alertes SIGAC,
 *              RDV) avec sparkline + variation hebdo + AreaChart corrections/jour
 *              + MaliHeatmap activité régionale + AlertsFeed live (mock SSE).
 *
 *              Tous les chiffres viennent de `MOCK_*` (Session 4). En Session 5+,
 *              remplacer par des Server Component fetches vers les services
 *              audit + correction + appointment + anticorruption.
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
import {
  KPI_SNAPSHOTS,
  CORRECTIONS_PER_DAY,
  ACTIVITY_BY_REGION,
  INITIAL_ALERTS,
} from '../../../../lib/mock-dashboard';
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
  // Référence temporelle stable pour les feeds — figée côté serveur, passée
  // aux client components pour éviter les hydration mismatch sur les
  // formatages relatifs (next-intl format.relativeTime). Cf. doc next-intl :
  // https://next-intl.dev/docs/usage/dates-times#relative-times-usenow
  const now = new Date().toISOString();

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_SNAPSHOTS.map((snapshot) => (
            <KpiCard key={snapshot.key} snapshot={snapshot} locale={locale} />
          ))}
        </div>
      </section>

      {/* ── AreaChart + Feed (2 colonnes desktop) ──────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('correctionsChartTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={CORRECTIONS_PER_DAY}
              tone="warning"
              height={220}
              ariaLabel={t('correctionsChartAria')}
            />
          </CardContent>
        </Card>

        <Suspense fallback={<Skeleton className="h-80 w-full" />}>
          <AlertsFeed initialAlerts={INITIAL_ALERTS} locale={locale} now={now} />
        </Suspense>
      </section>

      {/* ── MaliHeatmap activité régionale ─────────────────────────────── */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>{t('activityMapTitle')}</CardTitle>
            <CardDescription>{t('activityMapSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <MaliHeatmap
              data={[...ACTIVITY_BY_REGION]}
              geojson={maliPolygons as Parameters<typeof MaliHeatmap>[0]['geojson']}
              tone="sequential"
              width={720}
              ariaLabel={t('activityMapAria')}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
