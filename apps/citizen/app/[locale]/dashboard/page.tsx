/**
 * @file        dashboard/page.tsx
 * @description PC-05 — Tableau de bord citoyen avec suivi des demandes
 *              (corrections + rendez-vous). Affiche une timeline verticale
 *              animée des statuts successifs.
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
import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { FileText, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ submitted?: string; appointment?: string }>;
}

export default async function DashboardPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { submitted, appointment } = await searchParams;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations('dashboard');

  // ── Données mockées (à remplacer par api.correction.list + api.appointment.listMine)
  const corrections = [
    { id: 'corr-1', field: 'birthPlace', proposed: 'Sikasso', status: 'UNDER_REVIEW', createdAt: '2026-05-10', aiScore: 87 },
    { id: 'corr-2', field: 'profession', proposed: 'Couturière', status: 'APPROVED', createdAt: '2026-04-22', aiScore: 95 },
  ];
  const appointments = [
    { id: 'appt-1', centerName: 'CTDEC Bamako', scheduledAt: '2026-05-20T09:00:00Z', priority: 'P3', status: 'SCHEDULED' },
  ];

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
          <AlertTitle>{submitted ? t('toast.correctionTitle') : t('toast.appointmentTitle')}</AlertTitle>
          <AlertDescription>
            {submitted ? t('toast.correctionBody') : t('toast.appointmentBody')}
          </AlertDescription>
        </Alert>
      )}

      {/* Actions rapides */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ActionCard href={`/${locale}/nina/${session.user.nina ?? ''}`} icon={FileText} label={t('actions.viewFile')} />
        <ActionCard href={`/${locale}/nina/${session.user.nina ?? ''}/correction`} icon={FileText} label={t('actions.requestCorrection')} />
        <ActionCard href={`/${locale}/appointments/new`} icon={Calendar} label={t('actions.bookAppointment')} />
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
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm text-fg-muted">{t(`fields.${c.field}` as never)}</p>
                      <p className="font-medium">
                        → <span className="font-mono">{c.proposed}</span>
                      </p>
                      <p className="mt-1 text-xs text-fg-muted">
                        {t('corrections.submittedAt', { date: c.createdAt })}
                        {c.aiScore !== null && (
                          <>
                            {' · '}
                            {t('corrections.aiScore', { score: c.aiScore })}
                          </>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
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
                        {new Date(a.scheduledAt).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' })}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
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

function ActionCard({ href, icon: Icon, label }: { href: string; icon: typeof FileText; label: string }) {
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    UNDER_REVIEW: 'bg-warning-50 text-warning-700',
    APPROVED: 'bg-success-50 text-success-700',
    REJECTED: 'bg-danger-50 text-danger-700',
    SCHEDULED: 'bg-info-50 text-info-700',
    COMPLETED: 'bg-success-50 text-success-700',
  };
  return <Badge className={styles[status] ?? 'bg-bg-muted'}>{status}</Badge>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-fg-muted">{label}</CardContent>
    </Card>
  );
}
