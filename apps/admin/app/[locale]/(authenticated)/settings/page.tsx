/**
 * @file        (authenticated)/settings/page.tsx
 * @description AD — Paramètres (vue agent). Profil agent en lecture seule +
 *              préférences statiques. Stub honnête : l'édition sera activée avec
 *              auth-service (doc 08). Présent pour éviter un lien mort dans la
 *              sidebar.
 * @module      @nina-aes/admin
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Lock } from 'lucide-react';
import { requireRole } from '../../../../lib/auth/session';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);
  const t = await getTranslations('admin.settings');

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('profile')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label={t('name')}>{session.user.name}</Field>
              {session.user.matricule && (
                <Field label={t('matricule')}>{session.user.matricule}</Field>
              )}
              {session.user.centerId && <Field label={t('center')}>{session.user.centerId}</Field>}
              <Field label={t('language')}>Français (FR)</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('preferences')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Pref label={t('notifEmail')} value={t('on')} tone="on" />
            <Pref label={t('notifSms')} value={t('off')} tone="off" />
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Lock className="size-4" aria-hidden="true" />
        <AlertTitle>{t('comingSoonTitle')}</AlertTitle>
        <AlertDescription>{t('comingSoonBody')}</AlertDescription>
      </Alert>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

function Pref({ label, value, tone }: { label: string; value: string; tone: 'on' | 'off' }) {
  return (
    <div className="flex items-center justify-between rounded-base border border-border px-3 py-2">
      <span className="text-sm">{label}</span>
      <Badge
        className={tone === 'on' ? 'bg-success-50 text-success-700' : 'bg-bg-muted text-fg-muted'}
      >
        {value}
      </Badge>
    </div>
  );
}
