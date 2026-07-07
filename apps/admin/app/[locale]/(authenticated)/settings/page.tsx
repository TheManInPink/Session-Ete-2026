/**
 * @file        (authenticated)/settings/page.tsx
 * @description AD — Paramètres (vue agent). Profil agent, préférences (lecture
 *              seule honnête — l'édition viendra avec auth-service, doc 08) et
 *              volet « Sécurité & session » : mode d'authentification effectif,
 *              cloisonnement des rôles, traçabilité, bonnes pratiques.
 *
 *              Les données proviennent de la SESSION vérifiée (`requireRole`),
 *              pas de fixtures : le profil affiché est réellement celui du jeton
 *              (mock agent en dev, claims Keycloak en prod). Le mode d'auth est
 *              résolu par `resolveAuthMode` (même source que le kill-switch prod).
 *
 * @module      @nina-aes/admin
 */

import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { cn } from '@nina-aes/ui/lib/utils';
import { resolveAuthMode } from '@nina-aes/auth';
import { KeyRound, Lock, ScrollText, ShieldCheck, type LucideIcon } from 'lucide-react';
import { requireRole, AUTH_CONFIG } from '../../../../lib/auth/session';

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** Libellés lisibles des centres connus ; fallback : id « joliifié ». */
const CENTER_LABELS: Record<string, string> = {
  'ctdec-bamako': 'CTDEC Bamako',
  'ctdec-sikasso': 'CTDEC Sikasso',
  'ctdec-segou': 'CTDEC Ségou',
  'ravec-kayes': 'RAVEC Kayes',
  'ravec-mopti': 'RAVEC Mopti',
  dnec: 'DNEC',
};

function formatCenter(id: string): string {
  return CENTER_LABELS[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export default async function AdminSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN']);
  const t = await getTranslations('admin.settings');

  const { user } = session;
  const authMode = resolveAuthMode(AUTH_CONFIG); // 'mock' | 'keycloak'
  const recommendations = [t('security.rec1'), t('security.rec2'), t('security.rec3')];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
        </div>
        <Badge variant="muted" size="md">
          {t('readOnly')}
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Profil agent ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t('profile')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span
                className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-lg font-semibold text-primary"
                aria-hidden="true"
              >
                {initialsOf(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{user.name}</p>
                {user.email && <p className="truncate text-sm text-fg-muted">{user.email}</p>}
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {user.matricule && <Field label={t('matricule')}>{user.matricule}</Field>}
              {user.centerId && <Field label={t('center')}>{formatCenter(user.centerId)}</Field>}
              <Field label={t('language')}>Français (FR)</Field>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-fg-muted">{t('rolesLabel')}</dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {user.roles.map((r) => (
                    <Badge
                      key={r}
                      variant={r === 'ANTICORRUPTION_INSPECTOR' ? 'danger' : 'soft'}
                      size="sm"
                    >
                      {t(`roleLabels.${r}`)}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* ── Préférences (lecture seule) ──────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t('preferences')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Pref label={t('language')} value="Français (FR)" tone="neutral" />
            <Pref label={t('theme')} value={t('themeSystem')} tone="neutral" />
            <Pref label={t('notifEmail')} value={t('on')} tone="on" />
            <Pref label={t('notifSms')} value={t('off')} tone="off" />
          </CardContent>
        </Card>
      </div>

      {/* ── Sécurité & session ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <CardTitle>{t('security.title')}</CardTitle>
          </div>
          <CardDescription>{t('security.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SecurityRow
              icon={KeyRound}
              title={t('security.authMode')}
              badge={
                <Badge variant={authMode === 'keycloak' ? 'success' : 'warning'} size="sm">
                  {authMode === 'keycloak'
                    ? t('security.authModeKeycloak')
                    : t('security.authModeMock')}
                </Badge>
              }
            >
              {authMode === 'keycloak'
                ? t('security.authModeKeycloakNote')
                : t('security.authModeMockNote')}
            </SecurityRow>
            <SecurityRow icon={ShieldCheck} title={t('security.sessionToken')}>
              {t('security.sessionTokenNote')}
            </SecurityRow>
            <SecurityRow icon={Lock} title={t('security.compartment')}>
              {t('security.compartmentNote')}
            </SecurityRow>
            <SecurityRow icon={ScrollText} title={t('security.tracing')}>
              {t('security.tracingNote')}
            </SecurityRow>
          </div>

          {/* Actions de session — désactivées tant qu'auth-service n'est pas branché */}
          <div className="rounded-base border border-border p-3">
            <p className="mb-2 text-sm font-medium">{t('security.actionsTitle')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" disabled>
                {t('security.revokeOthers')}
              </Button>
              <Button variant="outline" size="sm" disabled>
                {t('security.rotateTokens')}
              </Button>
              <span className="text-xs text-fg-muted">{t('security.actionsPending')}</span>
            </div>
          </div>

          {/* Bonnes pratiques */}
          <div>
            <p className="mb-2 text-sm font-medium">{t('security.recommendationsTitle')}</p>
            <ul className="space-y-1.5 text-sm text-fg-muted">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ── Édition à venir (honnête) ──────────────────────────────────── */}
      <Alert>
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

function Pref({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'on' | 'off' | 'neutral';
}) {
  return (
    <div className="flex items-center justify-between rounded-base border border-border px-3 py-2">
      <span className="text-sm">{label}</span>
      <Badge
        variant={tone === 'on' ? 'success' : 'muted'}
        size="sm"
        className={cn(tone === 'off' && 'text-fg-muted')}
      >
        {value}
      </Badge>
    </div>
  );
}

function SecurityRow({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-base border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-fg-muted" aria-hidden={true} />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {badge}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{children}</p>
    </div>
  );
}
