/**
 * @file        (authenticated)/layout.tsx
 * @description Layout des routes authentifiées du portail gouvernance —
 *              `requireRole(['SUPERVISOR', 'ADMIN'])`, app-shell (sidebar fixe +
 *              contenu scrollable + pied de page). Miroir d'apps/admin.
 *
 * @module      @nina-aes/governance
 */

import { getTranslations } from 'next-intl/server';
import { AppFooter } from '@nina-aes/ui/components/business/app-footer';
import { requireRole } from '../../../lib/auth/session';
import { GovernanceSidebar } from '../../../components/governance-sidebar';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  const session = await requireRole(['SUPERVISOR', 'ADMIN']);
  const t = await getTranslations('governance.sidebar');

  return (
    <div className="flex h-screen overflow-hidden">
      <GovernanceSidebar
        locale={locale}
        official={{
          name: session.user.name,
          matricule: session.user.matricule,
          centerId: session.user.centerId,
        }}
      />
      <div className="flex flex-1 flex-col overflow-hidden pt-14 lg:pt-0">
        <main className="flex-1 overflow-y-auto bg-bg">{children}</main>
        <AppFooter appName={t('brand')} org={t('subtitle')} className="shrink-0" />
      </div>
    </div>
  );
}
