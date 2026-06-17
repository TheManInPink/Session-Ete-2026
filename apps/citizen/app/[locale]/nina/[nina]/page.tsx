/**
 * @file        [locale]/nina/[nina]/page.tsx
 * @description Écran PC-02 — Fiche citoyen (résultat de recherche NINA).
 *              Server Component qui appelle l'API identity-service côté serveur,
 *              avec fallback pédagogique (mode "demo") si l'API n'est pas
 *              disponible (utile tant que le backend n'est pas livré, docs 07+).
 *
 *              En mode démo, le profil riche (nom, profession, filiation…) est
 *              reconstruit de façon **déterministe** depuis le NINA via
 *              `generateDemoCitizen` (couture @nina-aes/api-client). Le même NINA
 *              produit toujours la même fiche — captures rejouables. La bascule
 *              vers le vrai backend ne touchera que la ligne de récupération.
 *
 * @module      @nina-aes/citizen
 */

import { validateNina, formatNina, parseNina } from '@nina-aes/utils';
import { generateDemoCitizen } from '@nina-aes/api-client';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Separator } from '@nina-aes/ui/components/separator';
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

  // Mode démo (backend pas encore live) : on reconstruit un profil riche et
  // déterministe à partir du NINA. Quand identity-service sera disponible
  // (doc 07), remplacer cette ligne par :
  //   const api = createApiClient({ baseUrl: process.env.API_BASE_URL! });
  //   const citizen = await api.identity.getByNina(nina);
  const citizen = generateDemoCitizen(nina);
  const parsed = parseNina(nina);
  const fullName = `${citizen.firstName} ${citizen.lastName}`;

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
              {/* Emplacement photo (mode démo) — initiales déterministes */}
              <div
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-primary-50 text-primary"
                role="img"
                aria-label={t('photoCaption')}
              >
                <span className="text-2xl font-semibold tracking-wide">{citizen.initials}</span>
                <span className="px-1 text-center text-[10px] leading-tight text-fg-muted">
                  {t('noPhoto')}
                </span>
              </div>
              <div>
                <CardTitle className="text-2xl">{fullName}</CardTitle>
                <p className="mt-1 font-mono text-sm text-fg-muted">{formatNina(citizen.nina)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="success" size="md">
                    <span aria-hidden="true">✓</span> {t('ninaValid')}
                  </Badge>
                  <Badge variant="muted" size="md">
                    {t('syntheticBadge')}
                  </Badge>
                </div>
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
              <Field label={t('sex')}>{citizen.sex === 'MALE' ? t('sexM') : t('sexF')}</Field>
              <Field label={t('birthDate')}>
                {citizen.birthMonth}/{citizen.birthYear}{' '}
                <span className="text-xs text-fg-muted">({t('estimated')})</span>
              </Field>
              <Field label={t('profession')}>{citizen.profession}</Field>
              <Field label={t('maritalStatus')}>{t(`marital${citizen.maritalStatus}`)}</Field>
            </dl>
          </section>

          <Separator />

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t('sectionFamily')}
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label={t('father')}>
                {citizen.father.firstName} {citizen.father.lastName}
              </Field>
              <Field label={t('mother')}>
                {citizen.mother.firstName} {citizen.mother.lastName}
              </Field>
            </dl>
          </section>

          <Separator />

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t('sectionLocation')}
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label={t('region')}>
                {citizen.regionName}{' '}
                <span className="text-xs text-fg-muted">(ML-{citizen.regionCode})</span>
              </Field>
              <Field label={t('cercleCode')}>{citizen.cercleCode}</Field>
              <Field label={t('communeCode')}>{citizen.communeCode}</Field>
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
