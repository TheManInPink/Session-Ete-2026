/**
 * @file        proxy.ts
 * @description Proxy Next.js 16 — i18n routing + auth guard + CSP à nonce pour
 *              la console agent CTDEC.
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
 *              CSP (docs/12 §9bis.4) — SANS `unsafe-inline` sur les scripts.
 *              Next.js App Router émet des `<script>` INLINE (flux RSC
 *              `self.__next_f`, bootstrap d'hydratation) : une CSP statique
 *              (`next.config.ts headers()`) sans nonce les bloque → aucune
 *              hydratation. On génère donc un **nonce par requête** ici (seul
 *              point d'interception par-requête en Next 16) : `'strict-dynamic'`
 *              fait confiance au bootstrap nonce-é et aux scripts qu'il charge.
 *              Le nonce est propagé au moteur de rendu via un override d'en-tête
 *              de requête (mécanisme `x-middleware-request-*` de Next, celui que
 *              `NextResponse.next({ request })` pose en interne).
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
 * Web Crypto uniquement (compatible runtime Edge/proxy). Un nonce par réponse
 * HTML — jamais réutilisé, jamais prévisible.
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
 * par le HMR/React Refresh (Turbopack) ; il n'est JAMAIS émis en production.
 */
function buildCsp(nonce: string): string {
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "'wasm-unsafe-eval'", // compilation WebAssembly (parité avec citizen/libsodium)
    ...(IS_DEV ? ["'unsafe-eval'"] : []), // HMR/React Refresh en dev uniquement
  ].join(' ');

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'", // Tailwind injecte des styles ; aucun script inline
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
 * Propage un override d'en-tête de REQUÊTE vers le moteur de rendu Next, via le
 * même canal interne que `NextResponse.next({ request: { headers } })` :
 * `x-middleware-override-headers` liste les noms surchargés et
 * `x-middleware-request-<nom>` porte la valeur. Indispensable pour que Next lise
 * la CSP à nonce et l'applique à SES `<script>` (sinon le bootstrap reste bloqué).
 * On fusionne avec les overrides déjà posés par next-intl (locale) sans les écraser.
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
    // Redirection : pas de corps HTML → pas de nonce à propager.
    return NextResponse.redirect(loginUrl);
  }

  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  const response = intlMiddleware(req) as NextResponse;

  // 1. Le moteur de rendu doit VOIR la CSP à nonce (il en extrait le nonce pour
  //    l'appliquer à ses <script> inline) → override d'en-tête de requête.
  setRequestHeaderOverride(response, 'content-security-policy', csp);
  setRequestHeaderOverride(response, 'x-nonce', nonce);
  // 2. Le navigateur doit APPLIQUER la CSP → en-tête de réponse.
  response.headers.set('content-security-policy', csp);

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
