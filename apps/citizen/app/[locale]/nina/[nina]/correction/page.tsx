/**
 * @file        nina/[nina]/correction/page.tsx
 * @description PC-03 — Demande de correction (wizard 4 étapes). Protégée par
 *              le middleware ; vérifie aussi que la session courante peut
 *              modifier ce NINA (citoyen propriétaire ou agent autorisé).
 * @module      @nina-aes/citizen
 */

import { CorrectionWizard } from './_components/correction-wizard';
import { getSession } from '../../../../../lib/auth/session';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Card } from '@nina-aes/ui/components/card';
import { ShieldAlert } from 'lucide-react';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ locale: string; nina: string }>;
}

export default async function CorrectionPage({ params }: PageProps) {
  const { locale, nina } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/nina/${nina}/correction`)}`);
  }

  const t = await getTranslations('correction');
  const isAgent = session.user.roles.some((r) => r === 'AGENT' || r === 'SUPERVISOR' || r === 'ADMIN');
  const isOwner = session.user.nina === nina;

  if (!isOwner && !isAgent) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <Card className="p-6 text-center">
          <ShieldAlert className="mx-auto mb-4 size-12 text-destructive" aria-hidden="true" />
          <h1 className="mb-2 text-xl font-bold">{t('unauthorized.title')}</h1>
          <p className="text-fg-muted">{t('unauthorized.message')}</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-fg-muted">
          {t('breadcrumb')}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="mt-2 text-fg-muted">
          {t('pageSubtitle')} <code className="font-mono text-fg">{nina}</code>
        </p>
      </header>

      <CorrectionWizard nina={nina} locale={locale} />
    </main>
  );
}
