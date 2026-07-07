/**
 * @file        [locale]/nina/[nina]/page.tsx
 * @description Écran PC-02 — Fiche citoyen (résultat de recherche NINA).
 *
 *              Server Component : récupère la fiche via la couture données
 *              `fetchCitizenFiche` (mock ↔ live, cf. lib/api/server.ts). En mode
 *              mock, le profil riche est reconstruit de façon **déterministe**
 *              depuis le NINA (captures rejouables) et une bannière « démo »
 *              s'affiche. En mode live, identity-service répond et la bannière
 *              disparaît — l'écran ne change pas, seule la source des données.
 *
 *              Présentation (spec PC-02) : chrome (SiteHeader/SiteFooter),
 *              données groupées en `Tabs` (Identité / Lieu de naissance /
 *              Filiation) + alerte info sur la source. L'onglet « Résidence »
 *              de la spec est **volontairement omis** : la résidence n'est pas
 *              encodée dans le NINA (les données déterministes couvrent le lieu
 *              de *naissance* uniquement) — pas de résidence fabriquée.
 *
 *              Les **codes** structurels (région/cercle/commune, lettre de
 *              contrôle) sont dérivés du NINA via `parseNina()`, donc identiques
 *              quelle que soit la source.
 *
 * @module      @nina-aes/citizen
 */

import { validateNina, formatNina, parseNina } from '@nina-aes/utils';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@nina-aes/ui/components/tabs';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@nina-aes/api-client';
import type { CitizenFiche } from '@nina-aes/api-client';
import { fetchCitizenFiche } from '../../../../lib/api/server';
import { getSession } from '../../../../lib/auth/session';
import { SiteHeader, type SiteHeaderUser } from '../../_components/site-header';
import { SiteFooter } from '../../_components/site-footer';

interface PageProps {
  params: Promise<{ locale: string; nina: string }>;
}

export default async function CitizenPage({ params }: PageProps) {
  const { locale, nina } = await params;
  setRequestLocale(locale);

  if (!validateNina(nina)) notFound();

  const t = await getTranslations('citizen.view');
  const tCommon = await getTranslations('common');

  // Session (facultative) pour l'en-tête : la fiche est consultable après
  // recherche NINA ; le menu utilisateur n'apparaît que si connecté.
  const session = await getSession();
  const user: SiteHeaderUser | null = session
    ? { name: session.user.name, nina: session.user.nina, email: session.user.email }
    : null;

  // Couture données : mock (profil démo déterministe) ↔ live (identity-service).
  // En live, un NINA introuvable renvoie `null` → 404. Les erreurs d'autorisation
  // sont traitées explicitement (fail-safe UX, pas de crash générique) :
  //   401 → session expirée → relogin en conservant la cible (`?next=`) ;
  //   403 → NINA d'autrui (NinaOwnershipGuard anti-IDOR) → refus clair sans
  //         confirmer l'existence du dossier visé.
  let fiche: CitizenFiche | null;
  try {
    fiche = await fetchCitizenFiche(nina);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/${locale}/login?next=/${locale}/nina/${nina}`);
    }
    if (err instanceof ApiError && err.status === 403) {
      return (
        <Shell locale={locale} user={user}>
          <Alert variant="danger" role="alert">
            <AlertTitle>{t('forbiddenTitle')}</AlertTitle>
            <AlertDescription>{t('forbiddenBody')}</AlertDescription>
          </Alert>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href={`/${locale}`}>{t('backHome')}</Link>
            </Button>
          </div>
        </Shell>
      );
    }
    throw err;
  }
  if (!fiche) notFound();

  const parsed = parseNina(nina);

  return (
    <Shell locale={locale} user={user}>
      {/* Fil d'Ariane */}
      <nav aria-label="breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-fg-muted">
        <Link href={`/${locale}`} className="hover:text-fg">
          {t('breadcrumbHome')}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-fg">{t('breadcrumbCurrent')}</span>
      </nav>

      {/* Bannière « mode démo » — uniquement quand les données sont synthétiques */}
      {fiche.synthetic && (
        <Alert variant="warning" className="mb-6">
          <AlertTitle>{t('demoTitle')}</AlertTitle>
          <AlertDescription>{t('demoBody')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            {/* Emplacement photo — initiales déterministes */}
            <div
              className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-primary-50 text-primary"
              role="img"
              aria-label={t('photoCaption')}
            >
              <span className="text-2xl font-semibold tracking-wide">{fiche.initials}</span>
              <span className="px-1 text-center text-[10px] leading-tight text-fg-muted">
                {t('noPhoto')}
              </span>
            </div>
            <div className="min-w-0">
              <CardTitle className="text-2xl">{fiche.fullName}</CardTitle>
              <div className="mt-1.5 inline-flex rounded-base bg-primary-50 px-2.5 py-1 font-mono text-sm font-medium text-primary">
                {formatNina(fiche.nina)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="success" size="md">
                  <span aria-hidden="true">✓</span> {t('ninaValid')}
                </Badge>
                {fiche.synthetic && (
                  <Badge variant="muted" size="md">
                    {t('syntheticBadge')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="identity">
            <TabsList aria-label={t('tabsLabel')} className="w-full justify-start sm:w-auto">
              <TabsTrigger value="identity">{t('sectionIdentity')}</TabsTrigger>
              <TabsTrigger value="birth">{t('birthPlace')}</TabsTrigger>
              <TabsTrigger value="parents">{t('sectionFamily')}</TabsTrigger>
            </TabsList>

            {/* Onglet Identité */}
            <TabsContent value="identity" className="pt-4">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field label={t('sex')}>{fiche.sex === 'MALE' ? t('sexM') : t('sexF')}</Field>
                <Field label={t('birthDate')}>
                  {fiche.birthLabel}{' '}
                  {fiche.birthEstimated && (
                    <span className="text-xs text-fg-muted">({t('estimated')})</span>
                  )}
                </Field>
                <Field label={t('profession')}>{fiche.profession}</Field>
                <Field label={t('maritalStatus')}>
                  {t(`marital${fiche.maritalStatus}` as never)}
                </Field>
              </dl>
            </TabsContent>

            {/* Onglet Lieu de naissance (codes dérivés du NINA) */}
            <TabsContent value="birth" className="pt-4">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field label={t('region')}>
                  {fiche.regionName}{' '}
                  <span className="text-xs text-fg-muted">(ML-{parsed.region})</span>
                </Field>
                <Field label={t('cercleCode')}>{fiche.cercleName ?? parsed.cercle}</Field>
                <Field label={t('communeCode')}>{fiche.communeName ?? parsed.commune}</Field>
                <Field label={t('checksum')}>
                  <code className="font-mono">{parsed.lettreControle}</code>
                </Field>
              </dl>
            </TabsContent>

            {/* Onglet Filiation */}
            <TabsContent value="parents" className="pt-4">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field label={t('father')}>
                  {fiche.father.firstName} {fiche.father.lastName}
                </Field>
                <Field label={t('mother')}>
                  {fiche.mother.firstName} {fiche.mother.lastName}
                </Field>
              </dl>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Source des données (spec PC-02) */}
      <Alert variant="info" className="mt-6">
        <AlertTitle>{t('infoTitle')}</AlertTitle>
        <AlertDescription>{t('infoBody')}</AlertDescription>
      </Alert>

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
    </Shell>
  );
}

/** Coque chrome (en-tête + pied) commune aux états succès et 403. */
function Shell({
  locale,
  user,
  children,
}: {
  locale: string;
  user: SiteHeaderUser | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader locale={locale} user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <SiteFooter locale={locale} />
    </div>
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
