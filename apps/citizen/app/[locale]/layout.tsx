/**
 * @file        [locale]/layout.tsx
 * @description Layout par locale — valide la locale du segment URL, active
 *              `setRequestLocale()` pour les Server Components imbriqués,
 *              et installe les providers globaux (next-intl + TanStack Query)
 *              via `<IntlBoundary>` enveloppé dans `<Suspense>`.
 *
 *              `<html>` et `<body>` sont définis dans le root layout
 *              `app/layout.tsx` (Next 16 l'exige) — `lang={locale}` y est
 *              résolu via `getLocale()`.
 *
 * @module      @nina-aes/citizen
 */

import { Suspense } from 'react';
import { defaultLocale, locales, type Locale } from '@nina-aes/i18n';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Providers } from '../../lib/providers';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export const metadata: Metadata = {
  title: 'NINA-AES — Portail citoyen',
  description:
    "Le portail numérique souverain de l'Alliance des États du Sahel : NINA, corrections, rendez-vous, signalements.",
};

/** Génération statique des routes par locale (PPR-friendly). */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale: rawLocale } = await params;
  const locale = locales.includes(rawLocale as Locale) ? (rawLocale as Locale) : null;
  if (!locale) notFound();

  // Active la locale pour les Server Components imbriqués
  setRequestLocale(locale);

  // Suspense exigé par Next 16 + cacheComponents : `getMessages()` est une
  // lecture dynamique (Request-scoped) qui bloquerait sinon le stream complet
  // de la coque statique.
  return (
    <Suspense fallback={null}>
      <IntlBoundary locale={locale}>{children}</IntlBoundary>
    </Suspense>
  );
}

/** Frontière async qui charge les messages et installe les providers globaux. */
async function IntlBoundary({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const messages = await getMessages({ locale: locale ?? defaultLocale });
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Africa/Bamako">
      <Providers>{children}</Providers>
    </NextIntlClientProvider>
  );
}
