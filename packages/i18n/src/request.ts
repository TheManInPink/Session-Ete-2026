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

/**
 * Fusionne récursivement deux arborescences de messages — `override` écrase
 * les feuilles correspondantes de `base`, sans toucher aux clés absentes.
 *
 * Utilisé pour superposer une traduction partielle (locale `xx.json`)
 * sur la traduction de référence FR. Cela permet aux fichiers skeleton
 * (SNK/FF/TMQ/HAU/MOS/DJE) de ne contenir QUE les clés effectivement
 * traduites — tout le reste tombe automatiquement en FR sans déclencher
 * `getMessageFallback` (qui ne renvoie qu'un placeholder textuel).
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseVal = out[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      out[key] = deepMerge(baseVal as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = normalizeLocale(requested);

  // FR est toujours chargé en base (traduction de référence, complète).
  const baseMessages = (
    await import(`../messages/${defaultLocale}.json`, { with: { type: 'json' } })
  ).default as Record<string, unknown>;

  // Si la locale demandée n'est pas FR, on charge sa traduction partielle
  // et on la superpose à la base FR — clé par clé, en profondeur.
  let messages: Record<string, unknown> = baseMessages;
  if (locale !== defaultLocale) {
    try {
      const overlay = (await import(`../messages/${locale}.json`, { with: { type: 'json' } }))
        .default as Record<string, unknown>;
      messages = deepMerge(baseMessages, overlay);
    } catch {
      // Fichier locale absent : on reste sur la base FR.
      messages = baseMessages;
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
        console.warn('[i18n]', error.message);
      }
    },
    getMessageFallback({ namespace, key }) {
      return `${namespace ? namespace + '.' : ''}${key}`;
    },
  };
});

export { locales, defaultLocale };
