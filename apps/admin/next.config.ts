/**
 * @file        next.config.ts
 * @description Configuration Next.js 16 pour apps/admin (port 4002).
 *
 *              - Plugin next-intl branché sur la config partagée
 *                `@nina-aes/i18n/src/request.ts`
 *              - `transpilePackages` pour les workspaces TS (Turbopack pré-build
 *                les .ts cross-packages)
 *              - `cacheComponents: true` — PPR-style streaming (Next 16
 *                a fusionné `experimental.ppr` dans cette option)
 *              - Headers sécurité par défaut (CSP, X-Frame, etc.)
 *
 * @module      @nina-aes/admin
 */

import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('../../packages/i18n/src/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Transpilation des packages workspace (TypeScript source non précompilé)
  transpilePackages: [
    '@nina-aes/ui',
    '@nina-aes/api-client',
    '@nina-aes/i18n',
    '@nina-aes/shared-types',
    '@nina-aes/utils',
  ],
  // Partial Prerendering — coque statique + données streamées
  cacheComponents: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
