/**
 * @file        html-lang-setter.tsx
 * @description Met à jour `document.documentElement.lang` côté client à partir
 *              du segment locale dans l'URL.
 *
 *              Justification — Next 16 + `cacheComponents` interdit toute lecture
 *              de request-scoped data (`cookies()`, `headers()`, `params`,
 *              `searchParams`, ou `getLocale()` de next-intl qui s'y rabat) en
 *              dehors d'une `<Suspense>`. Mais `<html lang>` doit être posé par
 *              le root layout qui ne peut pas être lui-même suspendu (c'est la
 *              coque HTML). Le compromis :
 *
 *                1. Le root layout pose `<html lang="fr">` statique (couvre ~80 %
 *                   du trafic + bonne valeur par défaut SEO crawler) ;
 *                2. Ce client component lit la locale depuis `usePathname()`
 *                   (zéro dépendance provider) et patche l'attribut au mount
 *                   et à chaque navigation.
 *
 *              `suppressHydrationWarning` sur `<html>` neutralise l'avertissement
 *              React si le serveur a streamé `lang="fr"` mais que le client
 *              corrige immédiatement vers `lang="bm"` (par exemple).
 *
 * @module      @nina-aes/citizen
 */

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const SUPPORTED_LOCALES = ['fr', 'bm', 'snk', 'ff', 'tmq', 'hau', 'mos', 'dje'] as const;
const DEFAULT_LOCALE = 'fr';

export function HtmlLangSetter() {
  const pathname = usePathname();

  useEffect(() => {
    const first = (pathname ?? '/').split('/')[1] ?? '';
    const lang = (SUPPORTED_LOCALES as readonly string[]).includes(first) ? first : DEFAULT_LOCALE;
    if (typeof document !== 'undefined' && document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
    }
  }, [pathname]);

  return null;
}
