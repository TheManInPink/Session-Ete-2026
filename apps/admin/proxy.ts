/**
 * @file        proxy.ts
 * @description Proxy Next.js 16 — i18n routing + auth guard pour la console
 *              agent CTDEC.
 *
 *              Routes publiques (accessibles sans `access_token`) :
 *                - /[locale]/login          (page de connexion)
 *                - /api/auth/*              (route handlers OIDC)
 *
 *              Routes protégées (redirection vers /login si non-connecté) :
 *                - /[locale]/                (racine, redirige vers dashboard)
 *                - /[locale]/dashboard
 *                - /[locale]/corrections/...
 *                - /[locale]/sigac/...
 *                - /[locale]/appointments/...
 *
 *              Note : le contrôle de rôle (AGENT/SUPERVISOR/AUDITOR/ADMIN)
 *              s'effectue côté Server Components via `requireRole()`. Le
 *              proxy ne vérifie que la présence du token.
 *
 * @module      @nina-aes/admin
 */

import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { defaultLocale, locales } from '@nina-aes/i18n';

const PUBLIC_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/(?:fr|bm|snk|ff|tmq|hau|mos|dje)\/?$/,
  /^\/(?:fr|bm|snk|ff|tmq|hau|mos|dje)\/login\/?$/,
];

const AUTH_MODE = (process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak';

const intlMiddleware = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
});

export default function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATTERNS.some((re) => re.test(pathname));
  const hasToken = req.cookies.has('access_token') || AUTH_MODE === 'mock';

  if (!isPublic && !hasToken) {
    const match = pathname.match(/^\/(fr|bm|snk|ff|tmq|hau|mos|dje)/);
    const locale = match?.[1] ?? defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(req) as NextResponse;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
