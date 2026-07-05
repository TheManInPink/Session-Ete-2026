/**
 * @file        proxy.ts
 * @description Proxy Next.js 16 (anciennement `middleware.ts`, renommé pour
 *              clarifier que le code tourne en frontière réseau Edge avant
 *              l'application — cf. https://nextjs.org/docs/messages/middleware-to-proxy).
 *              L'API (NextRequest/NextResponse, `config.matcher`) est identique.
 *
 *              Combine routage i18n (next-intl) et auth guard sur les routes
 *              du segment `(authenticated)/`.
 *
 *              Routes publiques (accessibles sans `access_token`) :
 *                - /[locale]/              (page d'accueil)
 *                - /[locale]/login          (page de connexion)
 *                - /[locale]/signalement    (PC-06 — anonyme)
 *                - /api/auth/*              (route handlers OIDC)
 *
 *              Routes protégées (redirection vers /login si non-connecté) :
 *                - /[locale]/dashboard
 *                - /[locale]/nina/...
 *                - /[locale]/appointments/...
 *
 * @module      @nina-aes/citizen
 */

import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { defaultLocale, locales } from '@nina-aes/i18n';

/**
 * Pages publiques — préfixe locale VRAIMENT optionnel : le garde d'auth tourne
 * AVANT le routing i18n, donc un chemin non préfixé (`/signalement` tapé
 * directement ou issu d'un lien relatif) doit matcher aussi, sinon le visiteur
 * anonyme est renvoyé au login avant même la redirection de locale.
 */
const PUBLIC_PATTERNS: RegExp[] = [
  /^\/$/, // racine → next-intl redirigera vers /fr/
  /^\/(?:fr|bm|snk|ff|tmq|hau|mos|dje)\/?$/,
  /^(?:\/(?:fr|bm|snk|ff|tmq|hau|mos|dje))?\/login\/?$/,
  /^(?:\/(?:fr|bm|snk|ff|tmq|hau|mos|dje))?\/signalement(?:\/.*)?$/,
];

const AUTH_MODE = (process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak';

// `next-intl` n'a pas (encore) renommé son sous-export `middleware` — on
// conserve donc le nom local `intlMiddleware` pour la délégation i18n.
const intlMiddleware = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
});

export default function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // 1) Vérifier l'authentification AVANT le routing i18n
  const isPublic = PUBLIC_PATTERNS.some((re) => re.test(pathname));
  const hasToken = req.cookies.has('access_token') || AUTH_MODE === 'mock';

  if (!isPublic && !hasToken) {
    // Détecter la locale courante depuis l'URL (ou fallback FR)
    const match = pathname.match(/^\/(fr|bm|snk|ff|tmq|hau|mos|dje)/);
    const locale = match?.[1] ?? defaultLocale;

    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2) Routing i18n
  return intlMiddleware(req) as NextResponse;
}

export const config = {
  // Exclut les assets statiques et les route handlers API.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
