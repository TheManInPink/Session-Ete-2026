/**
 * @file        (authenticated)/layout.tsx
 * @description Layout des routes authentifiées admin — applique le contrôle
 *              de rôle `requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN'])`
 *              et rend la sidebar fixe + zone de contenu scrollable.
 *
 *              Le segment `(authenticated)` est un Route Group : il ne paraît
 *              pas dans l'URL mais regroupe toutes les pages qui exigent une
 *              session active. Login reste hors de ce segment.
 *
 * @module      @nina-aes/admin
 */

import { requireRole } from '../../../lib/auth/session';
import { AdminSidebar } from '../../../components/admin-sidebar';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  const session = await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);

  return (
    <div className="flex min-h-screen">
      <AdminSidebar
        locale={locale}
        agent={{
          name: session.user.name,
          matricule: session.user.matricule,
          centerId: session.user.centerId,
        }}
      />
      <main className="flex-1 overflow-y-auto bg-bg">{children}</main>
    </div>
  );
}
