/**
 * @file        app/layout.tsx
 * @description Layout racine — rend `<html>` et `<body>` (exigé par Next 16,
 *              cf. https://nextjs.org/docs/messages/missing-root-layout-tags).
 *
 *              IMPORTANT — ce layout est volontairement **statique** (aucun
 *              `await`, aucune lecture de cookies/headers/params/locale).
 *              Next 16 + `cacheComponents` lèverait `blocking-route` si on
 *              tentait d'appeler `getLocale()` ici, parce que la résolution
 *              de locale est request-scoped et bloquerait le stream de la
 *              coque HTML avant tout `<Suspense>`.
 *
 *              `<html lang="fr">` est posé en SSR (FR couvre ~80 % du trafic
 *              + valeur par défaut SEO crawler raisonnable). Pour les autres
 *              locales, `<HtmlLangSetter />` (client) patche
 *              `document.documentElement.lang` au mount à partir de
 *              `usePathname()`. `suppressHydrationWarning` neutralise
 *              l'avertissement React lié à cette correction côté client.
 *
 * @module      @nina-aes/citizen
 */

import './globals.css';
import { Suspense } from 'react';
import { HtmlLangSetter } from './_components/html-lang-setter';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {/* HtmlLangSetter utilise `usePathname()` côté client — Next 16 +
            cacheComponents le considère comme un accès « request-scoped »
            (déductible du SSR). On l'enveloppe dans Suspense pour ne pas
            bloquer le stream de la coque statique. */}
        <Suspense fallback={null}>
          <HtmlLangSetter />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
