/**
 * @file        dashboard/page.tsx
 * @description AD-01 — Dashboard agent CTDEC. Placeholder Session 3 :
 *              accueil après login avec greeting + 3 cards de navigation
 *              rapide (corrections / RDV / SIGAC). Les KPIs + sparkline +
 *              heatmap + feed temps réel sont prévus Session 4.
 *
 * @module      @nina-aes/admin
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { PencilLine, CalendarDays, ShieldAlert } from 'lucide-react';
import { requireRole } from '../../../../lib/auth/session';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);
  const t = await getTranslations('admin.dashboard');

  const quickActions = [
    {
      icon: PencilLine,
      key: 'corrections' as const,
      href: 'corrections',
      tone: 'warning' as const,
    },
    {
      icon: CalendarDays,
      key: 'appointments' as const,
      href: 'appointments',
      tone: 'info' as const,
    },
    { icon: ShieldAlert, key: 'sigac' as const, href: 'sigac', tone: 'danger' as const },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('greeting', { name: session.user.name.split(' ')[0] ?? 'Agent' })}
        </h1>
        <p className="mt-2 text-fg-muted">{t('subtitle')}</p>
      </header>

      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="mb-4 text-lg font-semibold">
          {t('quickActionsTitle')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map(({ icon: Icon, key, href, tone }) => (
            <Link key={key} href={`./${href}`} className="block focus:outline-none">
              <Card className="h-full transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                <CardHeader>
                  <Icon
                    className={
                      tone === 'warning'
                        ? 'size-8 text-warning'
                        : tone === 'info'
                          ? 'size-8 text-info'
                          : 'size-8 text-destructive'
                    }
                    aria-hidden="true"
                  />
                  <CardTitle className="mt-2 text-lg">
                    {t(`quickActions.${key}.title`)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-fg-muted">
                  {t(`quickActions.${key}.description`)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-base border border-dashed border-border bg-bg-muted/40 p-6 text-sm text-fg-muted">
        <p className="font-medium text-fg">{t('placeholderTitle')}</p>
        <p className="mt-1">{t('placeholderBody')}</p>
      </section>
    </div>
  );
}
