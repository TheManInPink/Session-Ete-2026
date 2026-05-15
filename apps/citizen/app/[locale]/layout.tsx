/**
 * @file        [locale]/layout.tsx
 * @description Layout par locale — fournit la balise `<html lang="…">` et le
 *              provider next-intl qui rend `useTranslations()` accessible dans
 *              tout l'arbre client/serveur.
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

  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {/* Suspense exigé par Next 16 + cacheComponents : `getMessages()` est
            une lecture dynamique (Request-scoped) qui bloquerait sinon le
            stream complet de la coque statique. */}
        <Suspense fallback={null}>
          <IntlBoundary locale={locale}>{children}</IntlBoundary>
        </Suspense>
      </body>
    </html>
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
