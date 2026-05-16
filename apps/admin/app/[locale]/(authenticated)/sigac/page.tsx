/**
 * @file        sigac/page.tsx
 * @description AD-03 — Dashboard SIGAC. Layout 3 sections :
 *                1. MaliHeatmap alertes par région (tone="severity")
 *                2. Top 10 agents avec IntegrityScoreGauge
 *                3. Feed alertes filtrable (multi-sévérité + période)
 *                   piloté par <SigacClient /> qui simule un SSE temps réel.
 *
 *              En Session 5+ : remplacer mocks par fetches vers
 *              anticorruption-service (port 3009) + audit-service (port 3007).
 *
 * @module      @nina-aes/admin
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { MaliHeatmap } from '@nina-aes/ui/components/charts/mali-heatmap';
import { IntegrityGauge } from '@nina-aes/ui/components/charts/integrity-gauge';
import { Button } from '@nina-aes/ui/components/button';
import maliPolygons from '../../../../../../data/mali/mali-regions-polygons.json';
import { requireRole } from '../../../../lib/auth/session';
import {
  ALERTS_BY_REGION,
  TOP_AGENTS,
  INITIAL_ALERTS,
} from '../../../../lib/mock-dashboard';
import { SigacClient } from './_components/sigac-client';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SigacPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireRole(['SUPERVISOR', 'AUDITOR', 'ADMIN']);
  const t = await getTranslations('admin.sigac');
  // Référence temporelle stable pour le feed (voir dashboard/page.tsx).
  const now = new Date().toISOString();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="mt-1 text-fg-muted">{t('pageSubtitle')}</p>
      </header>

      {/* ── Heatmap alertes + Top agents (2 col desktop) ──────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('alertsMap.title')}</CardTitle>
            <CardDescription>{t('alertsMap.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <MaliHeatmap
              data={[...ALERTS_BY_REGION]}
              geojson={maliPolygons as Parameters<typeof MaliHeatmap>[0]['geojson']}
              tone="severity"
              width={480}
              ariaLabel={t('alertsMap.aria')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('topAgents.title')}</CardTitle>
            <CardDescription>{t('topAgents.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {TOP_AGENTS.map((agent) => (
                <li key={agent.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <IntegrityGauge name={agent.name} score={agent.score} />
                    <p className="ml-[156px] mt-0.5 text-xs text-fg-muted">
                      {agent.centerCode} · {agent.matricule}
                    </p>
                  </div>
                  {agent.score < 70 && (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/${locale}/sigac/agent/${agent.id}`}>
                        {t('topAgents.investigate')}
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* ── Feed filtrable temps réel ─────────────────────────────────── */}
      <SigacClient initialAlerts={INITIAL_ALERTS} locale={locale} now={now} />
    </div>
  );
}
