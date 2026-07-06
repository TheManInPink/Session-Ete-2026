/**
 * @file        (authenticated)/messagerie/page.tsx
 * @description GOV-01 — Messagerie officielle signée. Wrapper serveur (auth +
 *              locale) qui rend le client 3 colonnes branché sur
 *              `@nina-aes/api-client` (mock ↔ live, ADR-031). La signature des
 *              messages est un JWS RS256 émis côté serveur via Vault Transit
 *              (ADR-026/034) par governance-service (port 3010).
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
  const session = await requireRole(['SUPERVISOR', 'ADMIN']);

  // L'id de session sert à distinguer « moi » ↔ interlocuteurs dans les fils
  // (en mock : `mock-gov-001` = MOCK_GOVERNANCE_USER_ID, destinataire des fixtures).
  return <MessagerieClient locale={locale} viewerId={session.user.id} />;
}
