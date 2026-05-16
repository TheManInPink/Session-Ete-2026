/**
 * @file        app/layout.tsx
 * @description Layout racine apps/admin — statique, pose `<html>` et `<body>`
 *              (Next 16 exige ces tags au root et interdit toute lecture
 *              request-scoped pré-Suspense). La locale est patchée côté
 *              client par `<HtmlLangSetter />` à partir de `usePathname()`.
 *
 *              Cf. apps/citizen/app/layout.tsx pour la même architecture +
 *              justification.
 *
 * @module      @nina-aes/admin
 */

import './globals.css';
import { Suspense } from 'react';
import { HtmlLangSetter } from './_components/html-lang-setter';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NINA-AES — Console agents CTDEC',
  description:
    "Console interne des agents CTDEC NINA-AES : validation des corrections IA, dashboard, alertes SIGAC.",
  robots: {
    // Console interne — jamais indexée par les moteurs de recherche
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {/* Suspense exigée par Next 16 + cacheComponents — HtmlLangSetter
            lit usePathname() (request-scoped) et bloquerait sinon le stream
            de la coque statique. Cf. apps/citizen/app/layout.tsx. */}
        <Suspense fallback={null}>
          <HtmlLangSetter />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
