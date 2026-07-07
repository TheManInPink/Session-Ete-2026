/**
 * @file        (authenticated)/sigac/agent/[id]/page.tsx
 * @description AD-03 (détail) — Dossier d'intégrité d'un agent SIGAC. Cible du
 *              lien « Investiguer » du top-agents (page parente). Réutilise les
 *              composants du design system (Card / Badge / Alert / Sparkline) et
 *              le barème visuel d'`IntegrityGauge`.
 *
 *              CONTRAT HONNÊTE — la source reste `AdminDashboardStats.topAgents` :
 *                • mode live  → `topAgents = null` (agrégation Bloc D absente) :
 *                  état « indisponible », aucun dossier nominatif inventé ;
 *                • mode mock  → agent trouvé : dossier dérivé DÉTERMINISTE (démo,
 *                  cf. `lib/sigac/agent-detail`), signalé comme projection ;
 *                • id inconnu → 404.
 *
 *              SÉCURITÉ (défense en profondeur, comme la file scellée AD-03) :
 *                • lecture du dossier = périmètre parent
 *                  (SUPERVISOR / AUDITOR / ADMIN / ANTICORRUPTION_INSPECTOR) ;
 *                • ACTIONS d'investigation nominatives = cloisonnées OCLEI
 *                  (ANTICORRUPTION_INSPECTOR). L'enforcement dur reste backend.
 *
 * @module      @nina-aes/admin
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Sparkline } from '@nina-aes/ui/components/charts/sparkline';
import { cn } from '@nina-aes/ui/lib/utils';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Flag,
  Lock,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { requireRole, hasRole } from '../../../../../../lib/auth/session';
import { fetchAdminDashboardStats } from '../../../../../../lib/api/server';
import { UnavailableCard } from '../../../../../../components/unavailable-card';
import {
  buildAgentDetail,
  bandFor,
  type IntegrityBand,
} from '../../../../../../lib/sigac/agent-detail';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/** Variant de Badge + tonalité Sparkline par bande d'intégrité. */
const BAND_UI: Record<
  IntegrityBand,
  { badge: 'success' | 'warning' | 'danger'; spark: 'success' | 'warning' | 'danger' }
> = {
  good: { badge: 'success', spark: 'success' },
  watch: { badge: 'warning', spark: 'warning' },
  critical: { badge: 'danger', spark: 'danger' },
};

/** Couleur de texte sémantique alignée sur `IntegrityGauge`. */
function bandText(b: IntegrityBand): string {
  return b === 'good' ? 'text-success-700' : b === 'watch' ? 'text-warning-700' : 'text-danger-700';
}

/** Barre semi-circulaire réutilisant les tokens d'`IntegrityGauge`. */
function ScoreBar({ value, band }: { value: number; band: IntegrityBand }) {
  const bar =
    band === 'good' ? 'bg-success-500' : band === 'watch' ? 'bg-warning-500' : 'bg-destructive';
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg-muted">
      <div
        className={cn('h-full rounded-full transition-all', bar)}
        style={{ width: `${value}%` }}
      />
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

export default async function SigacAgentPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // Lecture du dossier = périmètre de la page parente AD-03.
  await requireRole(['SUPERVISOR', 'AUDITOR', 'ADMIN', 'ANTICORRUPTION_INSPECTOR']);
  // Actions d'investigation nominatives : cloisonnées OCLEI (need-to-know).
  const canInvestigate = await hasRole(['ANTICORRUPTION_INSPECTOR']);

  const t = await getTranslations('admin.sigac.agentDetail');
  const tSigac = await getTranslations('admin.sigac');
  const stats = await fetchAdminDashboardStats();

  const backHref = `/${locale}/sigac`;

  // ── Mode live : agrégation Bloc D absente → dossier indisponible ───────────
  if (stats.topAgents == null) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('back')}
        </a>
        <UnavailableCard title={t('unavailable.title')} body={t('unavailable.body')} />
      </div>
    );
  }

  const agent = stats.topAgents.find((a) => a.id === id);
  if (!agent) notFound();

  const detail = buildAgentDetail(agent);
  const ui = BAND_UI[detail.band];
  const histMin = Math.min(...detail.history);
  const histMax = Math.max(...detail.history);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      {/* ── Fil d'Ariane + retour ───────────────────────────────────────── */}
      <div className="space-y-3">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('back')}
        </a>
        <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 text-xs text-fg-muted">
          <a href={backHref} className="hover:text-fg hover:underline">
            {tSigac('pageTitle')}
          </a>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-fg">{t('breadcrumb')}</span>
        </nav>
      </div>

      {/* ── En-tête agent ───────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
            <Badge variant={ui.badge} size="md">
              {t(`band.${detail.band}`)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {t('matriculeLabel')} <span className="font-mono text-fg">{agent.matricule}</span>
            {' · '}
            {t('centerLabel')} <span className="text-fg">{agent.centerCode}</span>
          </p>
        </div>
      </header>

      {/* ── Bandeau « projection démo » (honnêteté) ─────────────────────── */}
      <Alert variant="info">
        <AlertTitle>{t('demo.title')}</AlertTitle>
        <AlertDescription>{t('demo.body')}</AlertDescription>
      </Alert>

      {/* ── Score + décomposition (2 col desktop) ───────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Vue d'ensemble */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>{t('overview.title')}</CardTitle>
              <CardDescription>{t('overview.subtitle')}</CardDescription>
            </div>
            <ShieldAlert
              className={cn('size-5 shrink-0', bandText(detail.band))}
              aria-hidden="true"
            />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="flex items-baseline gap-1.5">
                <span className={cn('text-5xl font-bold tabular-nums', bandText(detail.band))}>
                  {agent.score}
                </span>
                <span className="text-lg text-fg-muted">/ 100</span>
              </div>
              <div className="min-w-[180px] flex-1">
                <ScoreBar value={agent.score} band={detail.band} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                icon={Activity}
                label={t('overview.processed')}
                value={String(detail.processed30d)}
              />
              <StatTile
                icon={Flag}
                label={t('overview.flaggedRate')}
                value={`${detail.flaggedRate} %`}
                tone={detail.flaggedRate >= 20 ? 'text-danger-700' : 'text-fg'}
              />
              <StatTile
                icon={ShieldAlert}
                label={t('overview.openSignals')}
                value={String(detail.openSignals)}
                tone={detail.openSignals > 0 ? 'text-danger-700' : 'text-fg'}
              />
              <StatTile
                icon={CalendarClock}
                label={t('overview.lastReview')}
                value={detail.lastReviewDayLabel}
              />
            </div>

            {/* Historique 30 j */}
            <div className="rounded-base border border-border bg-bg-card p-3">
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-sm font-medium">{t('history.title')}</p>
                <p className="text-xs text-fg-muted">{t('history.subtitle')}</p>
              </div>
              <div className="h-14">
                <Sparkline
                  data={detail.history}
                  tone={ui.spark}
                  ariaLabel={`${t('history.title')} — ${histMin} à ${histMax} sur 30 jours`}
                  className="h-14"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Décomposition du score (5 critères pondérés) */}
        <Card>
          <CardHeader>
            <CardTitle>{t('criteria.title')}</CardTitle>
            <CardDescription>{t('criteria.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {detail.criteria.map((c) => {
                const cBand = bandFor(c.score);
                return (
                  <li key={c.key} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{c.label}</span>
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold tabular-nums',
                          bandText(cBand),
                        )}
                      >
                        {c.score}
                      </span>
                    </div>
                    <ScoreBar value={c.score} band={cBand} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-fg-muted">{c.hint}</span>
                      <Badge variant="muted" size="sm" className="shrink-0">
                        {c.weight}% {t('criteria.weight')}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* ── Opérations récentes ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('operations.title')}</CardTitle>
          <CardDescription>{t('operations.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-muted">
                  <th className="px-6 py-2 font-medium">{t('operations.when')}</th>
                  <th className="px-3 py-2 font-medium">{t('operations.type')}</th>
                  <th className="px-3 py-2 font-medium">{t('operations.detail')}</th>
                  <th className="px-6 py-2 text-right font-medium">{t('operations.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.operations.map((op) => (
                  <tr key={op.id} className={cn(op.status === 'flagged' && 'bg-danger-50/40')}>
                    <td className="px-6 py-2.5 font-mono text-xs text-fg-muted tabular-nums">
                      {op.dayLabel}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" size="sm">
                        {op.type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-fg">{op.detail}</td>
                    <td className="px-6 py-2.5 text-right">
                      {op.status === 'flagged' ? (
                        <Badge variant="danger" size="sm">
                          <Flag className="size-3" aria-hidden="true" />
                          {t('operations.flagged')}
                        </Badge>
                      ) : (
                        <Badge variant="muted" size="sm">
                          {t('operations.ok')}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Actions d'investigation (cloisonnées OCLEI) ─────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('actions.title')}</CardTitle>
          <CardDescription>{t('actions.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {canInvestigate ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" disabled>
                {t('actions.openCase')}
              </Button>
              <Button variant="outline" disabled>
                {t('actions.requestAudit')}
              </Button>
              <Button variant="outline" disabled>
                {t('actions.freeze')}
              </Button>
              <p className="w-full text-xs text-fg-muted">{t('actions.pendingBackend')}</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-fg-muted">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{t('actions.restricted')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
