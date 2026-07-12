/**
 * @file        nina/[nina]/correction/page.tsx
 * @description PC-03 — Demande de correction (wizard 4 étapes). Protégée par
 *              le middleware ; vérifie aussi que la session courante peut
 *              modifier ce NINA (citoyen propriétaire ou agent autorisé).
 * @module      @nina-aes/citizen
 */

import { CorrectionWizard, type CorrectionCitizen } from './_components/correction-wizard';
import { getSession } from '../../../../../lib/auth/session';
import { fetchCitizenFiche } from '../../../../../lib/api/server';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { validateNina } from '@nina-aes/utils';
import type { CorrectionField, CitizenFiche } from '@nina-aes/api-client';
import { Card } from '@nina-aes/ui/components/card';
import { ShieldAlert } from 'lucide-react';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ locale: string; nina: string }>;
}

/**
 * Extrait les valeurs actuelles corrigibles d'une fiche (comparaison PC-03).
 * Les valeurs absentes ou marquées « — » sont omises (comparaison impossible).
 */
function currentValuesOf(fiche: CitizenFiche): Partial<Record<CorrectionField, string>> {
  const clean = (s: string): string | undefined => {
    const v = s.trim();
    return v && v !== '—' ? v : undefined;
  };
  const join = (a: string, b: string): string | undefined =>
    [clean(a), clean(b)].filter(Boolean).join(' ') || undefined;

  const values: Partial<Record<CorrectionField, string>> = {};
  const set = (k: CorrectionField, v: string | undefined) => {
    if (v) values[k] = v;
  };

  set('firstName', clean(fiche.firstName));
  set('lastName', clean(fiche.lastName));
  set('birthDate', clean(fiche.birthLabel));
  set('birthPlace', clean(fiche.regionName));
  set('residence_cercle', clean(fiche.cercleName ?? ''));
  set('residence_commune', clean(fiche.communeName ?? ''));
  set('fatherName', join(fiche.father.firstName, fiche.father.lastName));
  set('motherName', join(fiche.mother.firstName, fiche.mother.lastName));
  set('profession', clean(fiche.profession));

  return values;
}

export default async function CorrectionPage({ params }: PageProps) {
  const { locale, nina } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/nina/${nina}/correction`)}`);
  }

  const t = await getTranslations('correction');
  const isAgent = session.user.roles.some(
    (r) => r === 'AGENT' || r === 'SUPERVISOR' || r === 'ADMIN',
  );
  const isOwner = session.user.nina === nina;

  if (!isOwner && !isAgent) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <Card className="p-6 text-center">
          <ShieldAlert className="mx-auto mb-4 size-12 text-destructive" aria-hidden="true" />
          <h1 className="mb-2 text-xl font-bold">{t('unauthorized.title')}</h1>
          <p className="text-fg-muted">{t('unauthorized.message')}</p>
        </Card>
      </main>
    );
  }

  // Valeurs actuelles (avant/après + pré-analyse) — best-effort : en cas d'échec
  // (live indisponible, 401/403), le wizard fonctionne sans comparaison.
  let citizen: CorrectionCitizen | undefined;
  if (validateNina(nina)) {
    try {
      const fiche = await fetchCitizenFiche(nina);
      if (fiche) {
        citizen = {
          fullName: fiche.fullName,
          initials: fiche.initials,
          birthLabel: fiche.birthLabel,
          synthetic: fiche.synthetic,
          currentValues: currentValuesOf(fiche),
        };
      }
    } catch {
      citizen = undefined;
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-fg-muted">
          {t('breadcrumb')}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="mt-2 text-fg-muted">
          {t('pageSubtitle')} <code className="font-mono text-fg">{nina}</code>
        </p>
      </header>

      <CorrectionWizard nina={nina} locale={locale} citizen={citizen} />
    </main>
  );
}
