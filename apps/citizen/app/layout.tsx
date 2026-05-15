/**
 * @file        app/layout.tsx
 * @description Layout racine — rend `<html>` et `<body>`. Next 16 exige que
 *              ces balises soient au niveau du root layout (cf.
 *              https://nextjs.org/docs/messages/missing-root-layout-tags),
 *              elles ne peuvent plus être déléguées au layout enfant
 *              `[locale]/layout.tsx`.
 *
 *              La locale active est résolue côté serveur via
 *              `getLocale()` (next-intl/server), qui lit le segment
 *              [locale] depuis le contexte de requête posé par le proxy
 *              i18n. Cela permet de poser `<html lang={locale}>` correct
 *              dès le premier rendu (SSR + SEO).
 *
 * @module      @nina-aes/citizen
 */

import './globals.css';
import { getLocale } from 'next-intl/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
