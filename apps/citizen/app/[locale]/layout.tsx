/**
 * @file        [locale]/layout.tsx
 * @description Layout par locale — fournit la balise `<html lang="…">` et le
 *              provider next-intl qui rend `useTranslations()` accessible dans
 *              tout l'arbre client/serveur.
 *
 * @module      @nina-aes/citizen
 */

import { defaultLocale, locales, type Locale } from '@nina-aes/i18n';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

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

  const messages = await getMessages({ locale: locale ?? defaultLocale });

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Africa/Bamako">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
