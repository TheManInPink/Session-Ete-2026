/**
 * @file        corrections/page.tsx
 * @description AD-02 — Gestion des corrections IA.
 *              Server component : contrôle de rôle + en-tête (compteur lu côté
 *              serveur via `fetchCorrectionsPage`, lib/api/server), puis hydrate
 *              le `CorrectionsClient` qui consomme `useCorrections`
 *              (@nina-aes/api-client/react — mock ou live selon le provider).
 *
 * @module      @nina-aes/admin
 */

import { Suspense } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Skeleton } from '@nina-aes/ui/components/skeleton';
import { requireRole } from '../../../../lib/auth/session';
import { fetchCorrectionsPage } from '../../../../lib/api/server';
import { CorrectionsClient } from './_components/corrections-client';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function CorrectionsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);
  const t = await getTranslations('admin.corrections');
  // Seul le compteur `total` est lu ici (pageSize 1) : la grille elle-même est
  // chargée côté client par useCorrections (mutations + invalidation).
  const { total } = await fetchCorrectionsPage({ page: 1, pageSize: 1 });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="mt-1 text-fg-muted">{t('pageSubtitle', { count: total })}</p>
      </header>

      <Suspense
        fallback={
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <CorrectionsClient />
      </Suspense>
    </div>
  );
}
