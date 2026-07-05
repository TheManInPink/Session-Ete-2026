/**
 * @file        [locale]/nina/page.tsx
 * @description Recherche NINA — point d'entrée lorsque l'URL ne porte pas
 *              encore de NINA (`/[locale]/nina`).
 *
 *              Deux intentions selon `?intent=` :
 *                - défaut / `view` : consulter sa fiche (PC-02). Cible du lien
 *                  « Voir ma fiche » et du tableau de bord sans NINA en session.
 *                  Après saisie → `/[locale]/nina/[nina]`.
 *                - `correction` : démarrer une demande de correction (PC-03).
 *                  Cible du lien « Demander une correction ». Après saisie →
 *                  `/[locale]/nina/[nina]/correction`.
 *
 * @module      @nina-aes/citizen
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { NinaHeroSearch, type NinaSearchIntent } from '../_components/nina-hero-search';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ intent?: string }>;
}

export default async function NinaSearchPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { intent: rawIntent } = await searchParams;
  setRequestLocale(locale);

  const intent: NinaSearchIntent = rawIntent === 'correction' ? 'correction' : 'view';

  const t = await getTranslations('citizen.search');
  const tView = await getTranslations('citizen.view');

  const title = intent === 'correction' ? t('correctionTitle') : t('title');
  const subtitle = intent === 'correction' ? t('correctionSubtitle') : t('subtitle');

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Fil d'Ariane */}
      <nav aria-label="breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-fg-muted">
        <Link href={`/${locale}`} className="hover:text-fg">
          {tView('breadcrumbHome')}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-fg">{title}</span>
      </nav>

      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-fg-muted">{subtitle}</p>

      <div className="mt-8 max-w-xl">
        <NinaHeroSearch intent={intent} />
      </div>
    </main>
  );
}
