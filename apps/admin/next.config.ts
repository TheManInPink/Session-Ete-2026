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

/** Vrai uniquement en build/exécution de production (HSTS + upgrade-insecure). */
const isProd = process.env.NODE_ENV === 'production';

// NB : la CSP stricte (docs/12 §9bis.4) N'EST PLUS posée ici. Une CSP statique
// sans nonce bloque les <script> INLINE de Next.js App Router (flux RSC,
// bootstrap d'hydratation) → aucune hydratation. Elle est désormais générée
// PAR REQUÊTE avec un nonce dans `proxy.ts` (seul point d'interception
// par-requête en Next 16). Les autres en-têtes ci-dessous restent statiques.

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
