/**
 * @file        admin-sidebar.tsx
 * @description Wrapper de la sidebar admin — résout l'i18n `admin.sidebar` +
 *              les icônes (côté client, non sérialisables via RSC) puis délègue
 *              le rendu à `AppSidebar` (design system, partagé avec gouvernance).
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  LayoutDashboard,
  PencilLine,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { AppSidebar, type AppSidebarNavItem } from '@nina-aes/ui/components/business/app-sidebar';

const NAV: { key: string; href: string; icon: LucideIcon }[] = [
  { key: 'dashboard', href: 'dashboard', icon: LayoutDashboard },
  { key: 'corrections', href: 'corrections', icon: PencilLine },
  { key: 'appointments', href: 'appointments', icon: CalendarDays },
  { key: 'sigac', href: 'sigac', icon: ShieldAlert },
  { key: 'settings', href: 'settings', icon: Settings },
];

/** Libellés lisibles des centres connus ; fallback : id « joliifié ». */
const CENTER_LABELS: Record<string, string> = {
  'ctdec-bamako': 'CTDEC Bamako',
  'ctdec-sikasso': 'CTDEC Sikasso',
  'ctdec-segou': 'CTDEC Ségou',
  'ravec-kayes': 'RAVEC Kayes',
  'ravec-mopti': 'RAVEC Mopti',
  dnec: 'DNEC',
};

function formatCenter(id: string): string {
  return CENTER_LABELS[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function AdminSidebar({
  locale,
  agent,
}: {
  locale: string;
  agent: { name: string; matricule: string | null; centerId: string | null; roleLabel: string };
}) {
  const t = useTranslations('admin.sidebar');
  const pathname = usePathname() ?? '';

  const items: AppSidebarNavItem[] = NAV.map(({ key, href, icon }) => ({
    key,
    href: `/${locale}/${href}`,
    label: t(`items.${key}`),
    icon,
  }));

  const metaLines = [
    agent.matricule ? `${t('matricule')} ${agent.matricule}` : null,
    agent.centerId ? formatCenter(agent.centerId) : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <AppSidebar
      className="admin-sidebar"
      brandEyebrow={t('brand')}
      brandSubtitle={t('subtitle')}
      navLabel={t('navLabel')}
      items={items}
      profile={{
        initials: initialsOf(agent.name),
        name: agent.name,
        roleLabel: agent.roleLabel,
        metaLines,
      }}
      logoutLabel={t('logout')}
      pathname={pathname}
      linkComponent={Link}
    />
  );
}
