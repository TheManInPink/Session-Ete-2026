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
