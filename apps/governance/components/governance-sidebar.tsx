/**
 * @file        governance-sidebar.tsx
 * @description Wrapper de la sidebar gouvernance — résout l'i18n
 *              `governance.sidebar` + les icônes puis délègue le rendu à
 *              `AppSidebar` (design system, partagé avec la console admin).
 *
 * @module      @nina-aes/governance
 */

'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FileText, ListChecks, Mail, type LucideIcon } from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@nina-aes/ui/components/business/app-sidebar';

const NAV: { key: string; href: string; icon: LucideIcon }[] = [
  { key: 'messagerie', href: 'messagerie', icon: Mail },
  { key: 'directives', href: 'directives', icon: ListChecks },
  { key: 'performance', href: 'performance', icon: BarChart3 },
  { key: 'rapports', href: 'rapports', icon: FileText },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function GovernanceSidebar({
  locale,
  official,
}: {
  locale: string;
  official: { name: string; matricule: string | null; centerId: string | null };
}) {
  const t = useTranslations('governance.sidebar');
  const pathname = usePathname() ?? '';

  const items: AppSidebarNavItem[] = NAV.map(({ key, href, icon }) => ({
    key,
    href: `/${locale}/${href}`,
    label: t(`items.${key}`),
    icon,
  }));

  const metaLines = [
    official.centerId ?? null,
    official.matricule ? `${t('matricule')} ${official.matricule}` : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <AppSidebar
      className="governance-sidebar"
      brandEyebrow={t('brand')}
      brandSubtitle={t('subtitle')}
      navLabel={t('navLabel')}
      items={items}
      profile={{
        initials: initialsOf(official.name),
        name: official.name,
        roleLabel: t('official'),
        metaLines,
      }}
      logoutLabel={t('logout')}
      pathname={pathname}
      linkComponent={Link}
    />
  );
}
