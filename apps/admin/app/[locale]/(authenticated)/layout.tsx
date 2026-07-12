/**
 * @file        (authenticated)/layout.tsx
 * @description Layout des routes authentifiées admin — contrôle de rôle
 *              `requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN'])`,
 *              app-shell (sidebar fixe + contenu scrollable + pied de page).
 *
 *              Le rôle affiché dans la sidebar est le plus élevé détenu par
 *              l'agent (réutilise les libellés `admin.settings.roleLabels`).
 *
 * @module      @nina-aes/admin
 */

import { getTranslations } from 'next-intl/server';
import { AppFooter } from '@nina-aes/ui/components/business/app-footer';
import { requireRole } from '../../../lib/auth/session';
import { AdminSidebar } from '../../../components/admin-sidebar';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/** Rôle le plus significatif → libellé affiché (du plus au moins élevé). */
const ROLE_PRIORITY = [
  'ADMIN',
  'ANTICORRUPTION_INSPECTOR',
  'AUDITOR',
  'SUPERVISOR',
  'AGENT',
] as const;

export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  const session = await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);

  const [tSidebar, tRoles] = await Promise.all([
    getTranslations('admin.sidebar'),
    getTranslations('admin.settings.roleLabels'),
  ]);
  const primaryRole = ROLE_PRIORITY.find((r) => session.user.roles.includes(r)) ?? 'AGENT';

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        locale={locale}
        agent={{
          name: session.user.name,
          matricule: session.user.matricule,
          centerId: session.user.centerId,
          roleLabel: tRoles(primaryRole),
        }}
      />
      <div className="flex flex-1 flex-col overflow-hidden pt-14 lg:pt-0">
        <main className="flex-1 overflow-y-auto bg-bg">{children}</main>
        <AppFooter appName={tSidebar('brand')} org={tSidebar('subtitle')} className="shrink-0" />
      </div>
    </div>
  );
}
