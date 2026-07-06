/**
 * @file        proxy.ts
 * @description Proxy Next.js 16 — i18n routing + auth guard + CSP à nonce pour
 *              le portail gouvernance. Miroir d'apps/admin.
 *
 *              Routes publiques : /[locale]/login, /api/auth/*.
 *              Routes protégées : tout le reste (messagerie, directives, …).
 *              Le contrôle de rôle (SUPERVISOR/ADMIN) s'effectue côté Server
 *              Components via `requireRole()` ; le proxy ne vérifie que la
 *              présence du token.
 *
 *              CSP (docs/12 §9bis.4) — SANS `unsafe-inline` sur les scripts.
 *              Next.js App Router émet des `<script>` INLINE (flux RSC,
 *              bootstrap d'hydratation) : une CSP statique sans nonce les bloque
 *              → aucune hydratation. Un **nonce par requête** est généré ici
 *              (seul point d'interception par-requête en Next 16) et propagé au
 *              moteur de rendu via override d'en-tête de requête.
 *
 * @module      @nina-aes/governance
 */

import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { defaultLocale, locales } from '@nina-aes/i18n';

const PUBLIC_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/(?:fr|bm|snk|ff|tmq|hau|mos|dje)\/?$/,
  /^\/(?:fr|bm|snk|ff|tmq|hau|mos|dje)\/login\/?$/,
];

// 🔒 Défaut sûr en production : sans `NINA_AUTH_MODE` explicite, on NE bascule
// PAS en `mock` en prod (sinon le bypass `hasToken` ci-dessous laisse passer
// tout visiteur non authentifié). `mock` reste le défaut en dev/test.
const AUTH_MODE = (process.env.NINA_AUTH_MODE ??
  (process.env.NODE_ENV === 'production' ? 'keycloak' : 'mock')) as 'mock' | 'keycloak';

const intlMiddleware = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
});

const IS_PROD = process.env.NODE_ENV === 'production';
const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Génère un nonce cryptographique (16 octets, base64) pour la CSP par requête.
 * Web Crypto uniquement (compatible runtime Edge/proxy).
 */
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Construit la CSP stricte (docs/12 §9bis.4). `script-src` refuse `unsafe-inline`
 * et s'appuie sur le nonce + `strict-dynamic`. En dev, `unsafe-eval` est requis
 * par le HMR/React Refresh (Turbopack) ; jamais émis en production.
 */
function buildCsp(nonce: string): string {
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "'wasm-unsafe-eval'",
    ...(IS_DEV ? ["'unsafe-eval'"] : []),
  ].join(' ');

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://api.nina-aes.ml wss://api.nina-aes.ml",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(IS_PROD ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * Propage un override d'en-tête de REQUÊTE vers le moteur de rendu Next (même
 * canal interne que `NextResponse.next({ request })`), pour que Next lise la CSP
 * à nonce et l'applique à SES `<script>`. Fusionne avec les overrides next-intl.
 */
function setRequestHeaderOverride(res: NextResponse, name: string, value: string): void {
  const key = name.toLowerCase();
  const current = res.headers.get('x-middleware-override-headers');
  const names = current
    ? current
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
    : [];
  if (!names.includes(key)) names.push(key);
  res.headers.set('x-middleware-override-headers', names.join(','));
  res.headers.set(`x-middleware-request-${key}`, value);
}

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

  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const response = intlMiddleware(req) as NextResponse;

  setRequestHeaderOverride(response, 'content-security-policy', csp);
  setRequestHeaderOverride(response, 'x-nonce', nonce);
  response.headers.set('content-security-policy', csp);

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
