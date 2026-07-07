/**
 * @file        (authenticated)/appointments/page.tsx
 * @description AD — Rendez-vous (vue agent). Planning du jour du centre :
 *              KPIs, carte « prochain appel », table des visites triées par
 *              heure. Réutilise Card / Badge / Alert du design system et le
 *              langage couleur de priorité de `PrioritySlot` (P1 danger / P2
 *              warning / P3 neutre).
 *
 *              CONTRAT HONNÊTE : la source `fetchCenterScheduleToday()` vaut
 *              `null` en mode live (appointment-service n'expose pas encore
 *              d'agrégation « file du centre » côté agent, doc 09) → état
 *              « indisponible » ; en mode mock, un planning déterministe.
 *
 *              CONFIDENTIALITÉ : identités citoyennes partiellement masquées
 *              (prénom + initiale) — minimisation des données à l'affichage.
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
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { cn } from '@nina-aes/ui/lib/utils';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Flag,
  PhoneCall,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AppointmentStatus, PriorityLevel } from '@nina-aes/api-client';
import { requireRole } from '../../../../lib/auth/session';
import { fetchCenterScheduleToday } from '../../../../lib/api/server';
import { UnavailableCard } from '../../../../components/unavailable-card';
import type { ScheduledVisit } from '../../../../lib/appointments/schedule';

interface PageProps {
  params: Promise<{ locale: string }>;
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'soft' | 'outline' | 'muted';

/** Variant de Badge par priorité (aligné sur `PrioritySlot`). */
const PRIORITY_VARIANT: Record<PriorityLevel, BadgeVariant> = {
  P1: 'danger',
  P2: 'warning',
  P3: 'muted',
};

/** Barre latérale de priorité (mêmes tokens que `PrioritySlot`). */
const PRIORITY_BAR: Record<PriorityLevel, string> = {
  P1: 'bg-destructive',
  P2: 'bg-warning',
  P3: 'bg-border',
};

/** Variant de Badge par statut de rendez-vous. */
const STATUS_VARIANT: Record<AppointmentStatus, BadgeVariant> = {
  REQUESTED: 'outline',
  SCHEDULED: 'soft',
  CONFIRMED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'muted',
  NO_SHOW: 'danger',
};

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

export default async function AdminAppointmentsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);

  const t = await getTranslations('admin.appointments');
  const schedule = await fetchCenterScheduleToday();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
        </div>
        {schedule && (
          <div className="flex flex-col items-end gap-1 text-sm">
            <Badge variant="soft" size="md">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {t('today')}
            </Badge>
            <span className="text-fg-muted">
              {t('centerLabel')} <span className="text-fg">{schedule.centerName}</span>
            </span>
          </div>
        )}
      </header>

      {schedule == null ? (
        <UnavailableCard title={t('unavailable.title')} body={t('unavailable.body')} />
      ) : (
        <>
          {/* ── KPIs du jour ─────────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={Users} label={t('kpis.total')} value={String(schedule.totals.total)} />
            <StatTile
              icon={CheckCircle2}
              label={t('kpis.confirmed')}
              value={String(schedule.totals.confirmed)}
              tone="text-success-700"
            />
            <StatTile
              icon={Clock}
              label={t('kpis.waiting')}
              value={String(schedule.totals.waiting)}
            />
            <StatTile
              icon={Flag}
              label={t('kpis.priority')}
              value={String(schedule.totals.priority)}
              tone={schedule.totals.priority > 0 ? 'text-danger-700' : 'text-fg'}
            />
          </section>

          {/* ── Bandeau démo (honnêteté) ─────────────────────────────────── */}
          <Alert variant="info">
            <AlertTitle>{t('demo.title')}</AlertTitle>
            <AlertDescription>{t('demo.body')}</AlertDescription>
          </Alert>

          {/* ── Prochain appel ───────────────────────────────────────────── */}
          <Card className="overflow-hidden">
            {schedule.nextUp ? (
              <div className="flex">
                <div
                  className={cn('w-1.5 shrink-0', PRIORITY_BAR[schedule.nextUp.priority])}
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <CardHeader>
                    <CardTitle>{t('nextUp.title')}</CardTitle>
                    <CardDescription>
                      {t('nextUp.queue', { n: schedule.nextUp.queueNumber })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-5">
                      <span className="font-display text-4xl font-bold tabular-nums">
                        {schedule.nextUp.time}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{schedule.nextUp.citizenRef}</span>
                          <Badge
                            variant={PRIORITY_VARIANT[schedule.nextUp.priority]}
                            size="sm"
                            title={t(`priority.${schedule.nextUp.priority}`)}
                          >
                            {schedule.nextUp.priority}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-fg-muted">{schedule.nextUp.reason}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button variant="solid" disabled>
                        <PhoneCall className="size-4" aria-hidden="true" />
                        {t('nextUp.call')}
                      </Button>
                      <span className="text-xs text-fg-muted">{t('nextUp.pendingBackend')}</span>
                    </div>
                  </CardContent>
                </div>
              </div>
            ) : (
              <CardContent className="py-8 text-center text-sm text-fg-muted">
                {t('nextUp.empty')}
              </CardContent>
            )}
          </Card>

          {/* ── Planning du jour ─────────────────────────────────────────── */}
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
                      <th className="px-6 py-2 font-medium">{t('table.time')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.queue')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.priority')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.citizen')}</th>
                      <th className="px-3 py-2 font-medium">{t('table.reason')}</th>
                      <th className="px-6 py-2 text-right font-medium">{t('table.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {schedule.visits.map((v: ScheduledVisit) => {
                      const done =
                        v.status === 'COMPLETED' ||
                        v.status === 'CANCELLED' ||
                        v.status === 'NO_SHOW';
                      return (
                        <tr key={v.id} className={cn(done && 'text-fg-muted')}>
                          <td className="px-6 py-2.5 font-mono tabular-nums">{v.time}</td>
                          <td className="px-3 py-2.5 tabular-nums">#{v.queueNumber}</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={cn(
                                  'inline-block h-3 w-1.5 rounded-full',
                                  PRIORITY_BAR[v.priority],
                                )}
                                aria-hidden="true"
                              />
                              <Badge
                                variant={PRIORITY_VARIANT[v.priority]}
                                size="sm"
                                title={t(`priority.${v.priority}`)}
                              >
                                {v.priority}
                              </Badge>
                            </span>
                          </td>
                          <td className={cn('px-3 py-2.5', !done && 'text-fg')}>{v.citizenRef}</td>
                          <td className="px-3 py-2.5">{v.reason}</td>
                          <td className="px-6 py-2.5 text-right">
                            <Badge variant={STATUS_VARIANT[v.status]} size="sm">
                              {t(`status.${v.status}`)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-6 pt-3 text-xs text-fg-muted">{t('privacyNote')}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
