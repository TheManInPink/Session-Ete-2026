/**
 * @file        aide/page.tsx
 * @description Page publique « Aide » — FAQ (partagée avec l'accueil PC-01) +
 *              bloc contact. Chrome citoyen §3.
 *
 * @module      @nina-aes/citizen
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Clock, Mail } from 'lucide-react';
import { Card, CardContent } from '@nina-aes/ui/components/card';
import { getSession } from '../../../lib/auth/session';
import { SiteHeader, type SiteHeaderUser } from '../_components/site-header';
import { SiteFooter } from '../_components/site-footer';
import { FaqSection } from '../_components/faq-section';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AidePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  const user: SiteHeaderUser | null = session
    ? { name: session.user.name, nina: session.user.nina, email: session.user.email }
    : null;

  const t = await getTranslations('citizen.aide');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader locale={locale} user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-fg-muted">{t('subtitle')}</p>

        <FaqSection className="mt-8" />

        <Card className="mt-10">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold">{t('contactTitle')}</h2>
            <p className="mt-1.5 text-sm text-fg-muted">{t('contactBody')}</p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-primary" aria-hidden="true" />
                <a href={`mailto:${t('contactEmail')}`} className="text-primary hover:underline">
                  {t('contactEmail')}
                </a>
              </p>
              <p className="flex items-center gap-2 text-fg-muted">
                <Clock className="size-4" aria-hidden="true" />
                {t('contactHours')}
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
