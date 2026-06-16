/**
 * @file        login/page.tsx
 * @description Page de connexion du portail gouvernance — bouton « Se connecter
 *              avec Keycloak » (flow PKCE, ou redirection directe en mode mock).
 *              Miroir d'apps/admin.
 * @module      @nina-aes/governance
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Button } from '@nina-aes/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { AlertTriangle, LogIn, Landmark } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function GovernanceLoginPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { next, error } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('governance.login');
  const loginHref = `/api/auth/login?locale=${locale}${next ? `&next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-base bg-primary text-primary-fg">
          <Landmark className="size-6" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{t('heading')}</h1>
        <p className="text-center text-fg-muted">{t('subheading')}</p>
      </div>

      {error && (
        <Alert variant="danger" className="mb-6 w-full">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>{t('error.title')}</AlertTitle>
          <AlertDescription>{t(`error.codes.${error}` as never)}</AlertDescription>
        </Alert>
      )}

      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('cta.title')}</CardTitle>
          <CardDescription>{t('cta.help')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild className="w-full" size="lg">
            <Link href={loginHref}>
              <LogIn className="size-4" aria-hidden="true" />
              {t('cta.button')}
            </Link>
          </Button>
          <p className="text-center text-xs text-fg-muted">{t('footer')}</p>
        </CardContent>
      </Card>
    </main>
  );
}
