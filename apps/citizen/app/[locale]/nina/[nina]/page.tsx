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
import { Separator } from '@nina-aes/ui/components/separator';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { UserRound } from 'lucide-react';
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
      {/* Fil d'Ariane */}
      <nav aria-label="breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-fg-muted">
        <Link href={`/${locale}`} className="hover:text-fg">
          {t('breadcrumbHome')}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-fg">{t('breadcrumbCurrent')}</span>
      </nav>

      <Alert variant="warning" className="mb-6">
        <AlertTitle>{t('demoTitle')}</AlertTitle>
        <AlertDescription>{t('demoBody')}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              {/* Emplacement photo (mode démo — pas de cliché disponible) */}
              <div
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-primary-50 text-fg-muted"
                role="img"
                aria-label={t('photoCaption')}
              >
                <UserRound className="size-9" aria-hidden="true" />
                <span className="px-1 text-center text-[10px] leading-tight">{t('noPhoto')}</span>
              </div>
              <div>
                <CardTitle className="text-2xl">Citoyen ML-{demoData.region}</CardTitle>
                <p className="mt-1 font-mono text-sm text-fg-muted">{demoData.formatted}</p>
                <Badge variant="success" size="md" className="mt-2">
                  <span aria-hidden="true">✓</span> {t('ninaValid')}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t('sectionIdentity')}
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label={t('sex')}>{demoData.sex === 'M' ? t('sexM') : t('sexF')}</Field>
              <Field label={t('birthDate')}>
                {demoData.moisNaissance}/19{demoData.anneeNaissance}{' '}
                <span className="text-xs text-fg-muted">({t('estimated')})</span>
              </Field>
            </dl>
          </section>

          <Separator />

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t('sectionLocation')}
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label={t('regionCode')}>ML-{demoData.region}</Field>
              <Field label={t('cercleCode')}>{demoData.cercle}</Field>
              <Field label={t('communeCode')}>{demoData.commune}</Field>
              <Field label={t('checksum')}>
                <code className="font-mono">{parsed.lettreControle}</code>
              </Field>
            </dl>
          </section>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild>
          <Link href={`/${locale}/nina/${nina}/correction`}>{t('requestCorrection')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}/appointments/new?nina=${nina}`}>{t('bookAppointment')}</Link>
        </Button>
        <Button variant="outline" disabled title={t('downloadPdfHint')}>
          {t('downloadPdf')}
        </Button>
        <Button asChild variant="ghost">
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
