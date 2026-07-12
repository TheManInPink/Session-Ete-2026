/**
 * @file        site-footer.tsx
 * @description Pied de page public/citoyen (charte §3) : bande tricolore AES
 *              (3px), 3 colonnes (Informations · Liens rapides · Contact) sur
 *              fond navy profond (`primary-800` = #122841), puis bandeau bas
 *              copyright + drapeaux AES.
 *
 * @module      @nina-aes/citizen
 */

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, Mail } from 'lucide-react';
import { CountryFlag } from '@nina-aes/ui/components/brand/country-flag';

/** Liens rapides du pied de page (fonctionnels + informatifs). */
const LINKS = [
  { key: 'home', href: '' },
  { key: 'tracking', href: 'dashboard' },
  { key: 'report', href: 'signalement' },
  { key: 'centres', href: 'centres' },
  { key: 'aide', href: 'aide' },
] as const;

export function SiteFooter({ locale }: { locale: string }) {
  const t = useTranslations('citizen.chrome.footer');
  const tLinks = useTranslations('citizen.chrome.footer.links');
  const homeHref = `/${locale}`;

  return (
    <footer className="bg-primary-800 text-white/70">
      {/* Bande tricolore AES — Mali · Burkina Faso · Niger. */}
      <div className="flex h-[3px] w-full" aria-hidden="true">
        <span className="flex-1 bg-aes-mali-green" />
        <span className="flex-1 bg-aes-burkina-red" />
        <span className="flex-1 bg-aes-niger-orange" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        {/* Col 1 — Informations */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            {t('infoTitle')}
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{t('tagline')}</p>
          <p className="mt-3 text-xs">{t('infoCtdec')}</p>
          <p className="text-xs">{t('infoDnec')}</p>
        </div>

        {/* Col 2 — Liens rapides */}
        <nav aria-label={t('linksTitle')}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            {t('linksTitle')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {LINKS.map(({ key, href }) => (
              <li key={key}>
                <Link
                  href={href ? `${homeHref}/${href}` : homeHref}
                  className="transition-colors hover:text-white"
                >
                  {tLinks(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Col 3 — Contact */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            {t('contactTitle')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              <span>{t('contactHours')}</span>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              <a
                href={`mailto:${t('contactEmail')}`}
                className="transition-colors hover:text-white"
              >
                {t('contactEmail')}
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bandeau bas — copyright + drapeaux. */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs sm:flex-row sm:px-6">
          <p>{t('copyright')}</p>
          <div className="flex items-center gap-2">
            <span className="text-white/50">{t('sovereignty')}</span>
            <span
              className="flex items-center gap-1"
              role="img"
              aria-label="Alliance des États du Sahel"
            >
              <CountryFlag country="MLI" size={16} />
              <CountryFlag country="BFA" size={16} />
              <CountryFlag country="NER" size={16} />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
