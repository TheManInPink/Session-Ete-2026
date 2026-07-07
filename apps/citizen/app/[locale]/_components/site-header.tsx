/**
 * @file        site-header.tsx
 * @description En-tête public/citoyen (charte §3) : barre sticky sombre
 *              `bg-primary`, logo NINA-AES, navigation centrale (Accueil /
 *              Suivi de demande / Signalement) et, à droite, sélecteur de langue
 *              + (selon la session) bouton « Se connecter » OU menu utilisateur
 *              avec avatar, identité et **déconnexion**.
 *
 *              La déconnexion passe par un `<form method="post">` vers la route
 *              API `/api/auth/logout` (jamais un `<Link>` : Next le préchargerait
 *              au survol → déconnexion accidentelle). Le bouton du menu y est
 *              relié via l'attribut `form=` (pas de form imbriqué dans le menu
 *              Radix).
 *
 *              Note fond sombre : le wordmark de `AesLogo` utilise `text-primary`
 *              (invisible sur `bg-primary`) → on rend l'icône seule + un wordmark
 *              clair custom.
 *
 * @module      @nina-aes/citizen
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { normalizeLocale } from '@nina-aes/i18n';
import { cn } from '@nina-aes/ui/lib/utils';
import { AesLogo } from '@nina-aes/ui/components/brand/aes-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nina-aes/ui/components/dropdown-menu';
import { LanguageSwitcher } from './language-switcher';

export interface SiteHeaderUser {
  name: string;
  nina: string | null;
  email: string | null;
}

/** Éléments de la navigation centrale (href relatif au préfixe locale). */
const NAV = [
  { key: 'home', href: '' },
  { key: 'centres', href: 'centres' },
  { key: 'aide', href: 'aide' },
] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function SiteHeader({ locale, user }: { locale: string; user: SiteHeaderUser | null }) {
  const t = useTranslations('common');
  const tNav = useTranslations('citizen.chrome.nav');
  const pathname = usePathname() ?? '';
  const homeHref = `/${locale}`;

  return (
    <header className="sticky top-0 z-40 bg-primary text-primary-fg shadow-sm">
      {/* Form de déconnexion (hors du menu Radix ; relié via `form=`). */}
      <form id="citizen-logout" action="/api/auth/logout" method="post" className="hidden" />

      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        {/* Logo — icône + wordmark clair custom. */}
        <Link
          href={homeHref}
          aria-label={`NINA-AES · ${tNav('home')}`}
          className="flex shrink-0 items-center gap-2 rounded-base focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
        >
          <AesLogo size="sm" showText={false} />
          <span className="text-base font-bold tracking-tight text-white">
            NINA<span className="text-accent-300">-AES</span>
          </span>
        </Link>

        {/* Navigation centrale (md+). */}
        <nav
          aria-label={tNav('label')}
          className="hidden flex-1 items-center justify-center gap-1 md:flex"
        >
          {NAV.map(({ key, href }) => {
            const target = href ? `${homeHref}/${href}` : homeHref;
            const isActive = href
              ? pathname === target || pathname.startsWith(`${target}/`)
              : pathname === homeHref;
            return (
              <Link
                key={key}
                href={target}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'rounded-base px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white',
                )}
              >
                {tNav(key)}
              </Link>
            );
          })}
        </nav>

        {/* Droite — langue + session. */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 md:ml-0">
          <LanguageSwitcher currentLocale={normalizeLocale(locale)} />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('myAccount')}
                  className="inline-flex h-11 items-center gap-2 rounded-base border border-white/30 py-1 pl-1 pr-2.5 text-sm text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                >
                  <span
                    className="flex size-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white"
                    aria-hidden="true"
                  >
                    {initialsOf(user.name)}
                  </span>
                  <span className="hidden max-w-[140px] truncate font-medium sm:inline">
                    {user.name}
                  </span>
                  <ChevronDown className="size-4 text-white/70" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="normal-case">
                  <span className="block text-sm font-medium text-fg">{user.name}</span>
                  {user.nina ? (
                    <span className="mt-0.5 block font-mono text-xs text-fg-muted">
                      NINA {user.nina}
                    </span>
                  ) : user.email ? (
                    <span className="mt-0.5 block truncate text-xs text-fg-muted">
                      {user.email}
                    </span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`${homeHref}/dashboard`}>
                    <LayoutDashboard className="size-4" aria-hidden="true" />
                    {t('dashboard')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  asChild
                  className="text-danger-700 focus:bg-danger-50 focus:text-danger-700"
                >
                  <button type="submit" form="citizen-logout" className="w-full">
                    <LogOut className="size-4" aria-hidden="true" />
                    {t('signOut')}
                  </button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              href={`${homeHref}/login`}
              className="rounded-base border border-white/40 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              {t('signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
