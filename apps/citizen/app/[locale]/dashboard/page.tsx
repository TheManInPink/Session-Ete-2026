/**
 * @file        dashboard/page.tsx
 * @description PC-05 — Tableau de bord citoyen avec suivi des demandes
 *              (corrections + rendez-vous). Chaque correction affiche une
 *              timeline verticale animée des statuts successifs
 *              (soumise → analyse IA → revue agent → décision → notification).
 *
 *              Mode démo : on génère des cards fictives en mémoire.
 *              En production, fetch via `api.correction.list({ nina })` +
 *              `api.appointment.listMine()`.
 * @module      @nina-aes/citizen
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '../../../lib/auth/session';
import { fetchMyCorrections, fetchMyAppointments } from '../../../lib/api/server';
import { Card, CardContent } from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { cn } from '@nina-aes/ui/lib/utils';
import { FileText, Calendar, ArrowRight, CheckCircle2, Check } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ submitted?: string; appointment?: string }>;
}

/** Étapes de la timeline de suivi d'une correction. */
const TIMELINE_STEPS = ['submitted', 'aiScored', 'agentReview', 'decision', 'notified'] as const;
type TimelineStep = (typeof TIMELINE_STEPS)[number];

/** Mappe un statut de correction sur l'avancement de la timeline. */
function progressFor(status: string): {
  current: number;
  outcome: 'approved' | 'rejected' | null;
} {
  switch (status) {
    case 'APPROVED':
      return { current: TIMELINE_STEPS.length, outcome: 'approved' };
    case 'REJECTED':
      return { current: TIMELINE_STEPS.length, outcome: 'rejected' };
    case 'UNDER_REVIEW':
    default:
      return { current: 2, outcome: null };
  }
}

export default async function DashboardPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { submitted, appointment } = await searchParams;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations('dashboard');

  // Libellés résolus côté serveur (passés aux composants synchrones).
  const timelineLabels: Record<string, string> = {
    submitted: t('timeline.submitted'),
    aiScored: t('timeline.aiScored'),
    agentReview: t('timeline.agentReview'),
    decision: t('timeline.decision'),
    notified: t('timeline.notified'),
    approved: t('timeline.approved'),
    rejected: t('timeline.rejected'),
    current: t('timeline.current'),
    pending: t('timeline.pending'),
  };
  const statusLabel = (s: string) =>
    ({
      UNDER_REVIEW: t('status.UNDER_REVIEW'),
      APPROVED: t('status.APPROVED'),
      REJECTED: t('status.REJECTED'),
      SCHEDULED: t('status.SCHEDULED'),
      COMPLETED: t('status.COMPLETED'),
    })[s] ?? s;

  // Couture données (mock ↔ live) : corrections + RDV du citoyen connecté.
  const [corrections, appointments] = await Promise.all([
    fetchMyCorrections(session.user.nina ?? undefined),
    fetchMyAppointments(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('greeting', { name: session.user.name })}
        </h1>
        <p className="mt-2 text-fg-muted">{t('subtitle')}</p>
      </header>

      {(submitted || appointment) && (
        <Alert className="mb-6 border-success bg-success-50">
          <CheckCircle2 className="size-4 text-success-700" aria-hidden="true" />
          <AlertTitle>
            {submitted ? t('toast.correctionTitle') : t('toast.appointmentTitle')}
          </AlertTitle>
          <AlertDescription>
            {submitted ? t('toast.correctionBody') : t('toast.appointmentBody')}
          </AlertDescription>
        </Alert>
      )}

      {/* Actions rapides */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ActionCard
          href={`/${locale}/nina/${session.user.nina ?? ''}`}
          icon={FileText}
          label={t('actions.viewFile')}
        />
        <ActionCard
          href={`/${locale}/nina/${session.user.nina ?? ''}/correction`}
          icon={FileText}
          label={t('actions.requestCorrection')}
        />
        <ActionCard
          href={`/${locale}/appointments/new`}
          icon={Calendar}
          label={t('actions.bookAppointment')}
        />
      </section>

      {/* Corrections en cours */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold">{t('corrections.title')}</h2>
        {corrections.length === 0 ? (
          <EmptyState label={t('corrections.empty')} />
        ) : (
          <ul className="space-y-3">
            {corrections.map((c) => (
              <li key={c.id}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-fg-muted">{t(`fields.${c.field}` as never)}</p>
                        <p className="font-medium">
                          → <span className="font-mono">{c.proposedValue}</span>
                        </p>
                        <p className="mt-1 text-xs text-fg-muted">
                          {t('corrections.submittedAt', { date: c.createdAt.slice(0, 10) })}
                        </p>
                      </div>
                      <StatusBadge status={c.status} label={statusLabel(c.status)} />
                    </div>
                    <CorrectionTimeline
                      status={c.status}
                      score={c.aiScore}
                      labels={timelineLabels}
                    />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Rendez-vous */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">{t('appointments.title')}</h2>
        {appointments.length === 0 ? (
          <EmptyState label={t('appointments.empty')} />
        ) : (
          <ul className="space-y-3">
            {appointments.map((a) => (
              <li key={a.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="font-medium">{a.centerName}</p>
                      <p className="text-sm text-fg-muted">
                        {new Date(a.scheduledAt).toLocaleString(locale, {
                          dateStyle: 'full',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    <StatusBadge status={a.status} label={statusLabel(a.status)} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** Timeline verticale du cycle de vie d'une correction (étape courante animée). */
function CorrectionTimeline({
  status,
  score,
  labels,
}: {
  status: string;
  score: number | null;
  labels: Record<string, string>;
}) {
  const { current, outcome } = progressFor(status);

  return (
    <ol className="mt-4 border-t pt-4">
      {TIMELINE_STEPS.map((step: TimelineStep, i) => {
        const done = i < current;
        const isCurrent = i === current;
        const isLast = i === TIMELINE_STEPS.length - 1;

        let label = labels[step];
        let labelColor = 'text-fg';
        if (step === 'aiScored' && done && score !== null) {
          label = `${labels.aiScored} · ${score}/100`;
        }
        if (step === 'decision' && outcome === 'approved') {
          label = labels.approved;
          labelColor = 'text-success-700';
        } else if (step === 'decision' && outcome === 'rejected') {
          label = labels.rejected;
          labelColor = 'text-danger-700';
        }

        return (
          <li key={step} className="flex gap-3">
            {/* Rail : pastille + segment de liaison */}
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border-2',
                  done && 'border-primary bg-primary text-primary-fg',
                  isCurrent && 'border-primary text-primary',
                  !done && !isCurrent && 'border-border',
                )}
              >
                {done ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : isCurrent ? (
                  <span
                    className="size-2 animate-pulse rounded-full bg-primary"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              {!isLast && (
                <span className={cn('min-h-6 w-0.5 flex-1', done ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
            {/* Libellé */}
            <div className="pb-4">
              <p
                className={cn(
                  'text-sm font-medium',
                  isCurrent ? 'text-primary' : done ? labelColor : 'text-fg-muted',
                )}
              >
                {label}
              </p>
              {isCurrent && <p className="text-xs text-fg-muted">{labels.current}</p>}
              {!done && !isCurrent && <p className="text-xs text-fg-muted">{labels.pending}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ActionCard({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border bg-bg-card p-4 transition-colors hover:border-primary hover:bg-primary-50/30"
    >
      <span className="flex items-center gap-3">
        <Icon className="size-5 text-primary" aria-hidden="true" />
        <span className="font-medium">{label}</span>
      </span>
      <ArrowRight className="size-4 text-fg-muted" aria-hidden="true" />
    </Link>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const styles: Record<string, string> = {
    UNDER_REVIEW: 'bg-warning-50 text-warning-700',
    APPROVED: 'bg-success-50 text-success-700',
    REJECTED: 'bg-danger-50 text-danger-700',
    SCHEDULED: 'bg-info-50 text-info-700',
    COMPLETED: 'bg-success-50 text-success-700',
  };
  return <Badge className={styles[status] ?? 'bg-bg-muted'}>{label}</Badge>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-fg-muted">{label}</CardContent>
    </Card>
  );
}
