/**
 * @file        sigac/page.tsx
 * @description AD-03 — Dashboard SIGAC. Layout 3 sections :
 *                1. MaliHeatmap alertes par région (tone="severity") —
 *                   `stats.alertsByRegion` du contrat AdminDashboardStats
 *                2. Top 10 agents avec IntegrityScoreGauge — `stats.topAgents`
 *                3. File procureur des signalements scellés, chargée côté
 *                   client par <SigacClient /> via `useWhistleblowerQueue`
 *
 *              CONTRAT HONNÊTE : les sections 1 et 2 valent `null` quand
 *              l'agrégation backend (Bloc D) n'existe pas — la page rend alors
 *              une `UnavailableCard`, jamais des chiffres inventés.
 *
 * @module      @nina-aes/admin
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { MaliHeatmap } from '@nina-aes/ui/components/charts/mali-heatmap';
import { IntegrityGauge } from '@nina-aes/ui/components/charts/integrity-gauge';
import { Button } from '@nina-aes/ui/components/button';
import { cn } from '@nina-aes/ui/lib/utils';
import { AlertTriangle } from 'lucide-react';
import maliPolygons from '../../../../../../data/mali/mali-regions-polygons.json';
import { requireRole, hasRole } from '../../../../lib/auth/session';
import { fetchAdminDashboardStats } from '../../../../lib/api/server';
import { toHeatmapData } from '../../../../lib/dashboard/view-model';
import { UnavailableCard } from '../../../../components/unavailable-card';
import { SigacClient } from './_components/sigac-client';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SigacPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Accès à la PAGE : encadrement + audit + inspection anti-corruption.
  // La heatmap et le top-agents (agrégats non nominatifs) sont visibles par tout
  // ce périmètre. La FILE PROCUREUR scellée, elle, est cloisonnée plus bas.
  await requireRole(['SUPERVISOR', 'AUDITOR', 'ADMIN', 'ANTICORRUPTION_INSPECTOR']);
  // Cloisonnement (need-to-know) : seul l'inspecteur anti-corruption OCLEI lit la
  // file des signalements scellés — un SUPERVISOR/AUDITOR/ADMIN ne doit pas même
  // voir les métadonnées bucketisées. Garde d'affichage en défense en profondeur ;
  // l'enforcement dur reste l'endpoint backend `require_role`.
  const canReadSealedQueue = await hasRole(['ANTICORRUPTION_INSPECTOR']);
  const t = await getTranslations('admin.sigac');
  const stats = await fetchAdminDashboardStats();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="mt-1 text-fg-muted">{t('pageSubtitle')}</p>
      </header>

      {/* ── Heatmap alertes + Top agents (2 col desktop) ──────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stats.alertsByRegion ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('alertsMap.title')}</CardTitle>
              <CardDescription>{t('alertsMap.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <MaliHeatmap
                data={toHeatmapData(stats.alertsByRegion)}
                geojson={maliPolygons as Parameters<typeof MaliHeatmap>[0]['geojson']}
                tone="severity"
                width={480}
                ariaLabel={t('alertsMap.aria')}
              />
            </CardContent>
          </Card>
        ) : (
          <UnavailableCard
            title={t('alertsMap.title')}
            body="L'agrégation régionale des alertes SIGAC sera fournie par le backend Bloc D à venir."
          />
        )}

        {stats.topAgents ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('topAgents.title')}</CardTitle>
              <CardDescription>{t('topAgents.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {stats.topAgents.map((agent) => {
                  const atRisk = agent.score < 70;
                  return (
                    <li
                      key={agent.id}
                      className={cn(
                        'flex items-center gap-3 rounded-base',
                        atRisk && 'border-l-2 border-danger bg-danger-50/50 py-1.5 pl-2 pr-1',
                      )}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          {atRisk && (
                            <AlertTriangle
                              className="size-4 shrink-0 text-danger"
                              aria-label={t('topAgents.atRisk')}
                            />
                          )}
                          <IntegrityGauge name={agent.name} score={agent.score} />
                        </div>
                        <p className="ml-[156px] mt-0.5 text-xs text-fg-muted">
                          {agent.centerCode} · {agent.matricule}
                        </p>
                      </div>
                      {atRisk && (
                        <Button asChild variant="outline" size="sm">
                          <a href={`/${locale}/sigac/agent/${agent.id}`}>
                            {t('topAgents.investigate')}
                          </a>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <UnavailableCard
            title={t('topAgents.title')}
            body="Le scoring d'intégrité des agents (ADR-023) n'est pas encore branché — Bloc D à venir."
          />
        )}
      </section>

      {/* ── File procureur des signalements scellés (cloisonnée) ──────── */}
      {canReadSealedQueue ? (
        <SigacClient />
      ) : (
        <UnavailableCard
          title="File des signalements scellés"
          body="Compartimentée : seul un inspecteur anti-corruption (OCLEI) habilité peut consulter la file des signalements scellés. Votre rôle donne accès aux agrégats régionaux, pas aux métadonnées de signalement."
        />
      )}
    </div>
  );
}
