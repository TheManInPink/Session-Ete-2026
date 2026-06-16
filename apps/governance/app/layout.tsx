/**
 * @file        app/layout.tsx
 * @description Layout racine apps/governance — statique, pose `<html>`/`<body>`
 *              (Next 16 exige ces tags au root et interdit toute lecture
 *              request-scoped pré-Suspense). La locale est patchée côté client
 *              par `<HtmlLangSetter />`. Miroir d'apps/admin et apps/citizen.
 *
 * @module      @nina-aes/governance
 */

import './globals.css';
import { Suspense } from 'react';
import { HtmlLangSetter } from './_components/html-lang-setter';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NINA-AES — Portail gouvernance SGOGT',
  description:
    'Portail de gouvernance traçable NINA-AES : messagerie officielle signée, suivi des directives, performance institutionnelle.',
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
        <Suspense fallback={null}>
          <HtmlLangSetter />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
