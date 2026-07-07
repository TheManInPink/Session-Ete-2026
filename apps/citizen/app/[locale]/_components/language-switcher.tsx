/**
 * @file        language-switcher.tsx
 * @description Sélecteur de langue — listbox accessible listant les 8 langues
 *              nationales AES avec leur autonyme et le drapeau SVG du pays porteur.
 *
 *              Pourquoi un listbox custom plutôt qu'un `<select>` natif : un
 *              `<option>` ne peut contenir que du texte, jamais de SVG. On passe
 *              donc par un Popover + `role="listbox"` / `role="option"` (clavier :
 *              Entrée/Espace pour activer, Échap pour fermer, focus géré par Radix)
 *              afin d'afficher les vrais drapeaux `<CountryFlag />`.
 *
 *              Comportement : au changement, navigue vers le même path en
 *              remplaçant le segment locale.
 *
 * @module      @nina-aes/citizen
 */

'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { locales, localeLabels, type Locale } from '@nina-aes/i18n';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import { CountryFlag, type AESCountryCode } from '@nina-aes/ui/components/brand/country-flag';
import { Popover, PopoverContent, PopoverTrigger } from '@nina-aes/ui/components/popover';

/**
 * Pays « porteur » de chaque langue (drapeau affiché). Aligné sur le
 * `LanguageSelector` du design system pour rester cohérent entre les deux.
 */
const LOCALE_COUNTRY: Record<Locale, AESCountryCode> = {
  fr: 'MLI',
  bm: 'MLI',
  snk: 'MLI',
  ff: 'MLI',
  tmq: 'MLI',
  hau: 'MLI',
  mos: 'BFA',
  dje: 'NER',
};

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
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const navigateTo = (next: Locale) => {
    setOpen(false);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('language')}
          disabled={isPending}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-base border border-border bg-bg-card px-3 text-sm text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            isPending && 'cursor-wait opacity-60',
            className,
          )}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin text-fg-muted" aria-hidden="true" />
          ) : (
            <CountryFlag country={LOCALE_COUNTRY[currentLocale]} size={18} />
          )}
          <span className="flex-1 text-left font-medium">{localeLabels[currentLocale]}</span>
          <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <ul role="listbox" aria-label={t('language')}>
          {locales.map((loc) => {
            const selected = loc === currentLocale;
            return (
              <li key={loc}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => navigateTo(loc)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors',
                    selected ? 'bg-primary/10 text-primary' : 'text-fg hover:bg-bg-muted',
                  )}
                >
                  <CountryFlag country={LOCALE_COUNTRY[loc]} size={18} />
                  <span className="flex-1 text-left">{localeLabels[loc]}</span>
                  {selected && <Check className="size-4" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
