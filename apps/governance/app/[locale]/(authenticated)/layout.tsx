/**
 * @file        (authenticated)/layout.tsx
 * @description Layout des routes authentifiées du portail gouvernance —
 *              `requireRole(['SUPERVISOR', 'ADMIN'])` + sidebar fixe + zone de
 *              contenu scrollable. Miroir d'apps/admin.
 *
 * @module      @nina-aes/governance
 */

import { requireRole } from '../../../lib/auth/session';
import { GovernanceSidebar } from '../../../components/governance-sidebar';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  const session = await requireRole(['SUPERVISOR', 'ADMIN']);

  return (
    <div className="flex min-h-screen">
      <GovernanceSidebar
        locale={locale}
        official={{
          name: session.user.name,
          matricule: session.user.matricule,
          centerId: session.user.centerId,
        }}
      />
      <main className="flex-1 overflow-y-auto bg-bg">{children}</main>
    </div>
  );
}
