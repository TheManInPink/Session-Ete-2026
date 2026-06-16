/**
 * @file        (authenticated)/messagerie/page.tsx
 * @description GOV-01 — Messagerie officielle signée. Wrapper serveur (auth +
 *              locale) qui rend le client 3 colonnes. Données mock ; la
 *              signature Ed25519 et l'horodatage serveur réels viendront de
 *              governance-service (port 3010, doc 22).
 * @module      @nina-aes/governance
 */

import { setRequestLocale } from 'next-intl/server';
import { requireRole } from '../../../../lib/auth/session';
import { MessagerieClient } from './_components/messagerie-client';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GovernanceMessageriePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(['SUPERVISOR', 'ADMIN']);

  return <MessagerieClient locale={locale} />;
}
