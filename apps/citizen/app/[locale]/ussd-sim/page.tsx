/**
 * @file        [locale]/ussd-sim/page.tsx
 * @description Écran USSD-01 — page hôte du simulateur USSD (outil de démo).
 *
 *              Le composant `UssdSimulator` (packages/ui) n'était monté nulle
 *              part : cette page le branche sur le vrai parcours en 8 langues du
 *              `ussd-service` via le BFF dev `/api/ussd-sim`.
 *
 *              🔒 Disponible hors production uniquement (ou opt-in explicite
 *              `NINA_ENABLE_USSD_SIM=true`) — ce n'est pas une surface de prod.
 *
 * @module      @nina-aes/citizen
 */

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@nina-aes/i18n';
import { UssdSimClient } from './_components/ussd-sim-client';

/** Outil de démo : actif hors production, ou en prod sur opt-in explicite. */
const USSD_SIM_ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.NINA_ENABLE_USSD_SIM === 'true';

export default async function UssdSimPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  if (!USSD_SIM_ENABLED) notFound();

  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-fg">Simulateur USSD</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Reproduit le parcours <code className="font-mono">*123#</code> des téléphones basiques, en
          8 langues nationales. Chaque touche est relayée au service USSD réel via le BFF de
          développement. Outil de démonstration — indisponible en production.
        </p>
      </header>
      <UssdSimClient />
    </main>
  );
}
