/**
 * @file        centres/page.tsx
 * @description Page publique « Centres CTDEC » — liste indicative des centres
 *              de traitement de l'état civil + antennes mobiles RAVEC (mode
 *              démo, bannière « données illustratives »). Chrome citoyen §3.
 *
 * @module      @nina-aes/citizen
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Clock, MapPin } from 'lucide-react';
import { Card, CardContent } from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { getSession } from '../../../lib/auth/session';
import { SiteHeader, type SiteHeaderUser } from '../_components/site-header';
import { SiteFooter } from '../_components/site-footer';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** Centres illustratifs (mode démo). Noms propres → non traduits. */
const CENTERS = [
  { city: 'Bamako', detail: 'District, Commune III', type: 'ctdec' as const },
  { city: 'Sikasso', detail: 'Centre-ville', type: 'ctdec' as const },
  { city: 'Ségou', detail: 'Quartier administratif', type: 'ctdec' as const },
  { city: 'Kayes', detail: 'Antenne mobile', type: 'ravec' as const },
  { city: 'Mopti', detail: 'Antenne mobile', type: 'ravec' as const },
];

export default async function CentresPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  const user: SiteHeaderUser | null = session
    ? { name: session.user.name, nina: session.user.nina, email: session.user.email }
    : null;

  const t = await getTranslations('citizen.centres');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader locale={locale} user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-fg-muted">{t('subtitle')}</p>

        <Alert className="mt-6">
          <AlertTitle>{t('demoTitle')}</AlertTitle>
          <AlertDescription>{t('demoBody')}</AlertDescription>
        </Alert>

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CENTERS.map((c) => (
            <li key={c.city}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                      <div>
                        <p className="font-semibold">{c.city}</p>
                        <p className="text-sm text-fg-muted">{c.detail}</p>
                      </div>
                    </div>
                    <Badge
                      className={
                        c.type === 'ctdec'
                          ? 'bg-primary-50 text-primary'
                          : 'bg-bg-muted text-fg-muted'
                      }
                    >
                      {c.type === 'ctdec' ? t('typeCtdec') : t('typeRavec')}
                    </Badge>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {t('hoursLabel')} · {t('hours')}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
