/**
 * @file        login/page.tsx
 * @description Page de connexion publique. Affiche un CTA qui démarre le flow
 *              OIDC via `/api/auth/login?next=…`. En mode `mock`, on est
 *              redirigé immédiatement vers `next`.
 *
 *              Si une erreur est passée en query (`?error=…`), un Alert
 *              s'affiche au-dessus du formulaire.
 * @module      @nina-aes/citizen
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@nina-aes/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@nina-aes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { AesLogo } from '@nina-aes/ui/components/brand/aes-logo';
import { LogIn, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { next = '/dashboard', error } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations('login');

  /**
   * Construit l'URL du route handler `/api/auth/login` avec les paramètres
   * `next` (cible post-login) et `locale`.
   */
  const loginHref = `/api/auth/login?next=${encodeURIComponent(next)}&locale=${encodeURIComponent(locale)}`;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        <AesLogo size="lg" showText={false} />
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
          <p className="text-center text-xs text-fg-muted">
            {t('privacyNotice')}{' '}
            <Link href={`/${locale}/signalement`} className="underline hover:text-primary">
              {t('anonymousLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
