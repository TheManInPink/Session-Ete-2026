/**
 * @file        (authenticated)/directives/page.tsx
 * @description GOV-02 — Suivi des directives (Kanban drag-and-drop). Wrapper
 *              serveur (auth + locale) qui rend le board client. Données mock ;
 *              l'escalade automatique (J+1/J+3/J+7) et la persistance viendront
 *              de governance-service (port 3010, doc 22).
 * @module      @nina-aes/governance
 */

import { setRequestLocale } from 'next-intl/server';
import { requireRole } from '../../../../lib/auth/session';
import { DirectivesBoard } from './_components/directives-board';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GovernanceDirectivesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(['SUPERVISOR', 'ADMIN']);

  return <DirectivesBoard locale={locale} />;
}
