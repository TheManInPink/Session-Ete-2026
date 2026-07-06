/**
 * @file        [locale]/layout.tsx
 * @description Layout par locale apps/governance — valide la locale, active
 *              `setRequestLocale`, installe NextIntl + TanStack Query via
 *              `<IntlBoundary>`. Miroir d'apps/admin.
 *
 * @module      @nina-aes/governance
 */

import { Suspense } from 'react';
import { defaultLocale, locales, type Locale } from '@nina-aes/i18n';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Providers } from '../../lib/providers';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale: rawLocale } = await params;
  const locale = locales.includes(rawLocale as Locale) ? (rawLocale as Locale) : null;
  if (!locale) notFound();

  setRequestLocale(locale);

  return (
    <Suspense fallback={null}>
      <IntlBoundary locale={locale}>{children}</IntlBoundary>
    </Suspense>
  );
}

async function IntlBoundary({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const messages = await getMessages({ locale: locale ?? defaultLocale });
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Africa/Bamako">
      <Providers>{children}</Providers>
    </NextIntlClientProvider>
  );
}
