/**
 * @file        [locale]/nina/[nina]/not-found.tsx
 * @description Page 404 spécifique à la route NINA — déclenchée si validateNina()
 *              échoue ou si l'API renvoie 404.
 */

import { Button } from '@nina-aes/ui/components/button';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

export default function NinaNotFound() {
  const locale = useLocale();
  const t = useTranslations('citizen.view');
  const tCommon = useTranslations('common');
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <p className="text-6xl">🔍</p>
      <h1 className="mt-4 text-2xl font-bold">{t('notFound')}</h1>
      <p className="mt-2 text-fg-muted">
        Le NINA saisi n'est pas valide ou n'existe pas dans le référentiel.
      </p>
      <Button asChild className="mt-6">
        <Link href={`/${locale}`}>{tCommon('back')}</Link>
      </Button>
    </main>
  );
}
