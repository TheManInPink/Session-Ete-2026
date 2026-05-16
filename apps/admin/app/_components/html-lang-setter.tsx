/**
 * @file        html-lang-setter.tsx
 * @description Met à jour `document.documentElement.lang` côté client à partir
 *              du segment locale dans l'URL.
 *
 *              Pattern miroir d'`apps/citizen` — extraire dans
 *              `@nina-aes/auth` (ou `@nina-aes/ui`) en Session 4 quand le
 *              3ème app `governance` rejoindra le repo.
 *
 *              Justification : voir docstring du composant équivalent dans
 *              apps/citizen.
 *
 * @module      @nina-aes/admin
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
