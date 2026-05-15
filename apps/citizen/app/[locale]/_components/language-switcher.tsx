/**
 * @file        language-switcher.tsx
 * @description Sélecteur de langue — dropdown natif accessible listant les
 *              8 langues nationales AES avec leur autonyme et drapeau.
 *
 *              Comportement : au changement, navigue vers le même path en
 *              remplaçant le segment locale. Préserve les `searchParams`.
 *
 *              Accessibilité : `<select>` natif → support clavier, lecteur
 *              d'écran, et navigation mobile out-of-the-box. Label visuellement
 *              caché mais exposé aux AT via `sr-only`.
 *
 * @module      @nina-aes/citizen
 */

'use client';

import { useTransition, type ChangeEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { locales, localeLabels, localeFlags, type Locale } from '@nina-aes/i18n';
import { Languages, Loader2 } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';

export function LanguageSwitcher({
  currentLocale,
  className,
}: {
  currentLocale: Locale;
  className?: string;
}) {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Locale;
    if (next === currentLocale) return;

    // Remplace le premier segment de path par la nouvelle locale.
    // `pathname` ressemble à `/fr/dashboard` ou `/bm/nina/189…/correction`.
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0 && (locales as readonly string[]).includes(segments[0]!)) {
      segments[0] = next;
    } else {
      segments.unshift(next);
    }
    const newPath = '/' + segments.join('/');

    startTransition(() => {
      router.replace(newPath);
      router.refresh(); // recharge les messages côté serveur
    });
  };

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 rounded-base border border-border bg-bg-card px-3 py-2',
        'text-sm focus-within:ring-2 focus-within:ring-ring',
        isPending && 'opacity-60',
        className,
      )}
    >
      <span className="sr-only">{t('language')}</span>
      {isPending ? (
        <Loader2 className="size-4 animate-spin text-fg-muted" aria-hidden="true" />
      ) : (
        <Languages className="size-4 text-fg-muted" aria-hidden="true" />
      )}
      <select
        value={currentLocale}
        onChange={handleChange}
        disabled={isPending}
        className="cursor-pointer bg-transparent pr-2 text-sm font-medium outline-none disabled:cursor-wait"
        aria-label={t('language')}
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {localeFlags[loc]} {localeLabels[loc]}
          </option>
        ))}
      </select>
    </label>
  );
}
