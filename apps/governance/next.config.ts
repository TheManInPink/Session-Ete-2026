/**
 * @file        next.config.ts
 * @description Configuration Next.js 16 pour apps/governance (port 4003).
 *
 *              Miroir d'apps/admin : plugin next-intl branché sur la config
 *              partagée `@nina-aes/i18n/src/request.ts`, transpilePackages des
 *              workspaces TS, `cacheComponents` (PPR-style streaming) et headers
 *              de sécurité par défaut (console interne).
 *
 * @module      @nina-aes/governance
 */

import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('../../packages/i18n/src/request.ts');

/** Vrai uniquement en build/exécution de production (HSTS + upgrade-insecure). */
const isProd = process.env.NODE_ENV === 'production';

// NB : la CSP stricte (docs/12 §9bis.4) est générée PAR REQUÊTE avec un nonce
// dans `proxy.ts` (une CSP statique sans nonce bloque les <script> INLINE de
// Next.js App Router → aucune hydratation). Les autres en-têtes restent statiques.

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Masque l'indicateur de dev Next.js (pour des captures de soutenance propres).
  devIndicators: false,
  transpilePackages: [
    '@nina-aes/ui',
    '@nina-aes/api-client',
    '@nina-aes/auth',
    '@nina-aes/i18n',
    '@nina-aes/shared-types',
    '@nina-aes/utils',
  ],
  cacheComponents: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
