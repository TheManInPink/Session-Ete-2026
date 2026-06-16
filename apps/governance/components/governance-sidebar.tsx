/**
 * @file        governance-sidebar.tsx
 * @description Sidebar fixe du portail gouvernance — 4 sections (messagerie,
 *              directives, performance, rapports) + footer profil haut
 *              fonctionnaire + déconnexion. Miroir d'apps/admin/admin-sidebar.
 *
 * @module      @nina-aes/governance
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Mail, ListChecks, BarChart3, FileText, LogOut, type LucideIcon } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';

interface NavItem {
  key: 'messagerie' | 'directives' | 'performance' | 'rapports';
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'messagerie', href: 'messagerie', icon: Mail },
  { key: 'directives', href: 'directives', icon: ListChecks },
  { key: 'performance', href: 'performance', icon: BarChart3 },
  { key: 'rapports', href: 'rapports', icon: FileText },
];

export function GovernanceSidebar({
  locale,
  official,
}: {
  locale: string;
  official: { name: string; matricule: string | null; centerId: string | null };
}) {
  const t = useTranslations('governance.sidebar');
  const pathname = usePathname() ?? '';

  return (
    <aside className="governance-sidebar flex h-screen w-60 shrink-0 flex-col">
      {/* Logo + titre */}
      <div className="border-b border-white/10 px-4 py-5">
        <p className="text-xs uppercase tracking-wider text-white/60">{t('brand')}</p>
        <p className="mt-1 text-lg font-bold">NINA-AES</p>
        <p className="text-xs text-white/50">{t('subtitle')}</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 px-2 py-4" aria-label={t('navLabel')}>
        {NAV_ITEMS.map(({ key, href, icon: Icon }) => {
          const fullHref = `/${locale}/${href}`;
          const isActive = pathname === fullHref || pathname.startsWith(`${fullHref}/`);
          return (
            <Link
              key={key}
              href={fullHref}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-base px-3 py-2 text-sm transition-colors',
                'hover:bg-white/10',
                isActive ? 'bg-white/15 font-medium' : 'text-white/80',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{t(`items.${key}`)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer profil + logout */}
      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-3">
          <p className="text-xs uppercase tracking-wider text-white/50">{t('official')}</p>
          <p className="text-sm font-medium">{official.name}</p>
          {official.centerId && <p className="text-xs text-white/50">{official.centerId}</p>}
          {official.matricule && (
            <p className="text-xs text-white/50">
              {t('matricule')} {official.matricule}
            </p>
          )}
        </div>
        {/* Déconnexion = navigation vers une route API serveur (form GET), pas une page Next. */}
        <form action="/api/auth/logout">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-base px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>{t('logout')}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
