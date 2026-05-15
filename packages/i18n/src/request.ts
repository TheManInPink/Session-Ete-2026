/**
 * @file        request.ts
 * @description Configuration `next-intl` côté serveur — charge les messages JSON
 *              correspondant à la locale demandée, avec fallback FR si la locale
 *              est inconnue.
 *
 *              À importer dans `apps/<X>/next.config.ts` :
 *
 *              ```ts
 *              import createNextIntlPlugin from 'next-intl/plugin';
 *              const withNextIntl = createNextIntlPlugin(
 *                '../../packages/i18n/src/request.ts'
 *              );
 *              ```
 *
 * @module      @nina-aes/i18n
 */

import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, locales, normalizeLocale, type Locale } from './index';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = normalizeLocale(requested);

  // Charge dynamiquement le fichier JSON correspondant ;
  // si manquant (langue pas encore traduite), fallback FR.
  let messages: Record<string, unknown>;
  try {
    messages = (await import(`../messages/${locale}.json`, { with: { type: 'json' } })).default;
  } catch {
    if (locale !== defaultLocale) {
      messages = (await import(`../messages/${defaultLocale}.json`, { with: { type: 'json' } })).default;
    } else {
      messages = {};
    }
  }

  return {
    locale,
    messages,
    timeZone: 'Africa/Bamako',
    formats: {
      dateTime: {
        short: { day: 'numeric', month: 'short', year: 'numeric' },
        full: {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      },
      number: {
        percent: { style: 'percent', maximumFractionDigits: 1 },
      },
    },
    // Évite que next-intl ne logge en boucle pour les clés manquantes des langues
    // partiellement traduites (BM/SNK/FF/...). Le fallback FR est appliqué.
    onError(error) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('[i18n]', error.message);
      }
    },
    getMessageFallback({ namespace, key }) {
      return `${namespace ? namespace + '.' : ''}${key}`;
    },
  };
});

export { locales, defaultLocale };
