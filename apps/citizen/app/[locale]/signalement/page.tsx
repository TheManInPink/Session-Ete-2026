/**
 * @file        signalement/page.tsx
 * @description PC-06 — Signalement anonyme SIGAC. **Route publique**, accessible
 *              sans authentification. Aucun cookie d'auth n'est lu ici.
 *
 *              Le formulaire pose un bandeau « mode anonyme actif » visible et
 *              redirige vers `/[locale]/signalement/confirmation?token=…` après
 *              soumission réussie.
 * @module      @nina-aes/citizen
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@nina-aes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { ShieldCheck } from 'lucide-react';
import { WhistleblowerForm } from './_components/whistleblower-form';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SignalementPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('signalement');

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-fg-muted">{t('subtitle')}</p>
      </header>

      <Alert className="mb-6 border-info bg-info-50">
        <ShieldCheck className="size-4 text-info-700" aria-hidden="true" />
        <AlertTitle>{t('anonymousBanner.title')}</AlertTitle>
        <AlertDescription>{t('anonymousBanner.body')}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.title')}</CardTitle>
          <CardDescription>{t('form.help')}</CardDescription>
        </CardHeader>
        <CardContent>
          <WhistleblowerForm />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-fg-muted">{t('footnote')}</p>
    </main>
  );
}
