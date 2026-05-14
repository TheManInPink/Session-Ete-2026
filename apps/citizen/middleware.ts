/**
 * @file        middleware.ts
 * @description Middleware Next.js — routage i18n avec next-intl.
 *              Préfixe systématique `/fr/`, `/bm/`, … et redirection automatique
 *              vers la locale par défaut si l'URL n'en contient pas.
 *
 * @module      @nina-aes/citizen
 */

import createIntlMiddleware from 'next-intl/middleware';
import { defaultLocale, locales } from '@nina-aes/i18n';

export default createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
});

export const config = {
  // Inclut toutes les routes sauf les assets statiques et l'API auth.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
