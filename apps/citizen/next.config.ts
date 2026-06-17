/**
 * @file        next.config.ts
 * @description Configuration Next.js 16 pour apps/citizen (port 4001).
 *
 *              - Plugin next-intl branché sur le fichier de configuration
 *                partagé `@nina-aes/i18n/src/request.ts`
 *              - `transpilePackages` pour les workspaces TS (Turbopack pré-build
 *                les .ts cross-packages sans nécessiter d'étape de compilation)
 *              - Headers sécurité par défaut (CSP, X-Frame, etc.)
 *
 * @module      @nina-aes/citizen
 */

import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('../../packages/i18n/src/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Masque l'indicateur de dev Next.js (pour des captures de soutenance propres).
  devIndicators: false,
  // Transpilation des packages workspace (TypeScript source non précompilé)
  transpilePackages: [
    '@nina-aes/ui',
    '@nina-aes/api-client',
    '@nina-aes/auth',
    '@nina-aes/i18n',
    '@nina-aes/shared-types',
    '@nina-aes/utils',
  ],
  // Partial Prerendering — coque statique + données streamées
  // (Next 16 a fusionné `experimental.ppr` dans `cacheComponents`)
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
