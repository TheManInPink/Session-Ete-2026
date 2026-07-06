/**
 * @file        (authenticated)/rapports/page.tsx
 * @description Rapports de gouvernance (shell S5). Stub honnête : la génération
 *              de rapports mensuels sera activée avec governance-service.
 * @module      @nina-aes/governance
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@nina-aes/ui/components/card';
import { FileText } from 'lucide-react';
import { requireRole } from '../../../../lib/auth/session';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GovernanceRapportsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(['SUPERVISOR', 'ADMIN']);
  const t = await getTranslations('governance.rapports');

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
      </header>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-50 text-primary">
            <FileText className="size-7" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">{t('soonTitle')}</h2>
          <p className="max-w-md text-sm text-fg-muted">{t('soonBody')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
