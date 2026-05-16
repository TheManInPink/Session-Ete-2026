/**
 * @file        corrections/page.tsx
 * @description AD-02 — Gestion des corrections IA.
 *              Server component qui charge les 50 corrections mockées
 *              (Session 3) puis hydrate le `CorrectionsClient` (TanStack
 *              Table + drawer Sheet).
 *
 *              Quand correction-service côté agent sera livré (Session 4+),
 *              remplacer `MOCK_CORRECTIONS` par `await api.correction
 *              .listForAgent({ page: 1, pageSize: 100 })` exécuté ici.
 *
 * @module      @nina-aes/admin
 */

import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Skeleton } from '@nina-aes/ui/components/skeleton';
import { requireRole } from '../../../../lib/auth/session';
import { MOCK_CORRECTIONS } from '../../../../lib/mock-corrections';
import { CorrectionsClient } from './_components/corrections-client';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function CorrectionsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);
  const t = await getTranslations('admin.corrections');

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="mt-1 text-fg-muted">
          {t('pageSubtitle', { count: MOCK_CORRECTIONS.length })}
        </p>
      </header>

      <Suspense
        fallback={
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <CorrectionsClient initialData={MOCK_CORRECTIONS} />
      </Suspense>
    </div>
  );
}
