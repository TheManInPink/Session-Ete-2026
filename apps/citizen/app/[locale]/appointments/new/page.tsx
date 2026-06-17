/**
 * @file        appointments/new/page.tsx
 * @description PC-04 — Prise de rendez-vous au CTDEC ou en antenne mobile RAVEC.
 *              Affiche un sélecteur de centre + créneaux disponibles + bouton
 *              de confirmation. Mode démo : créneaux fictifs en mémoire.
 * @module      @nina-aes/citizen
 */

import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth/session';
import { AppointmentForm } from './_components/appointment-form';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Skeleton } from '@nina-aes/ui/components/skeleton';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewAppointmentPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/appointments/new`)}`);
  }

  const t = await getTranslations('appointments');
  const isVulnerable = session.user.roles.includes('VULNERABLE');

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('new.title')}</h1>
        <p className="mt-2 text-fg-muted">{t('new.subtitle')}</p>
        {isVulnerable && (
          <Badge className="mt-3 bg-success-50 text-success-700 hover:bg-success-50">
            {t('new.priorityBadge')}
          </Badge>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('new.formTitle')}</CardTitle>
          <CardDescription>{t('new.formHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Suspense exigé par Next 16 + cacheComponents : AppointmentForm
              utilise `new Date()` au render (génération de créneaux mock). */}
          <Suspense
            fallback={
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            }
          >
            <AppointmentForm
              locale={locale}
              isPriority={isVulnerable}
              nina={session.user.nina ?? ''}
            />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
