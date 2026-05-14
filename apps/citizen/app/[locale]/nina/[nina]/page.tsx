/**
 * @file        [locale]/nina/[nina]/page.tsx
 * @description Écran PC-02 — Fiche citoyen (résultat de recherche NINA).
 *              Server Component qui appelle l'API identity-service côté serveur,
 *              avec fallback pédagogique (mode "demo") si l'API n'est pas
 *              disponible (utile tant que le backend n'est pas livré, docs 07+).
 *
 * @module      @nina-aes/citizen
 */

import { validateNina, formatNina, parseNina } from '@nina-aes/utils';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ locale: string; nina: string }>;
}

export default async function CitizenPage({ params }: PageProps) {
  const { locale, nina } = await params;
  setRequestLocale(locale);

  if (!validateNina(nina)) notFound();

  const t = await getTranslations('citizen.view');
  const tCommon = await getTranslations('common');

  // En mode démo (backend pas encore live), on parse le NINA pour extraire
  // les composants structurels et on affiche un placeholder réaliste.
  // Quand identity-service sera disponible (doc 07), remplacer ce bloc par :
  //   const api = createApiClient({ baseUrl: process.env.API_BASE_URL! });
  //   const citizen = await api.identity.getByNina(nina);
  const parsed = parseNina(nina);
  const demoData = {
    nina,
    formatted: formatNina(nina),
    sex: parsed.sexe === 1 ? 'M' : 'F',
    anneeNaissance: parsed.anneeNaissance,
    moisNaissance: parsed.moisNaissance,
    region: parsed.region,
    cercle: parsed.cercle,
    commune: parsed.commune,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-6 text-sm text-fg-muted">
        <Link href={`/${locale}`} className="hover:text-fg">
          ←&nbsp;{tCommon('back')}
        </Link>
      </nav>

      <Alert variant="warning" className="mb-6">
        <AlertTitle>Mode démonstration</AlertTitle>
        <AlertDescription>
          Le backend identity-service n'est pas encore connecté (cf. doc 07). Les données
          affichées ci-dessous sont dérivées du NINA lui-même (structure interne).
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-2xl">Citoyen ML-{demoData.region}</CardTitle>
              <p className="mt-1 font-mono text-sm text-fg-muted">{demoData.formatted}</p>
            </div>
            <Badge variant="success" size="md">
              <span aria-hidden="true">✓</span> NINA valide
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label={t('sex')}>{demoData.sex === 'M' ? 'Masculin' : 'Féminin'}</Field>
            <Field label={t('birthDate')}>
              {demoData.moisNaissance}/19{demoData.anneeNaissance} (estimation depuis NINA)
            </Field>
            <Field label="Code région">ML-{demoData.region}</Field>
            <Field label="Code cercle">{demoData.cercle}</Field>
            <Field label="Code commune">{demoData.commune}</Field>
            <Field label="Lettre de contrôle">
              <code className="font-mono">{parsed.lettreControle}</code>
            </Field>
          </dl>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={`/${locale}/corrections/new?nina=${nina}`}>{t('requestCorrection')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}`}>{tCommon('back')}</Link>
        </Button>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 font-medium text-fg">{children}</dd>
    </div>
  );
}
