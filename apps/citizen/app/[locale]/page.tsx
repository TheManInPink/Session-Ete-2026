/**
 * @file        [locale]/page.tsx
 * @description Écran PC-01 — Accueil citoyen.
 *              Hero tricolore AES + NinaInput proéminent + 4 cartes d'action.
 *
 *              Conformité spec : docs/design-system/screens.md §PC-01.
 *
 * @module      @nina-aes/citizen
 */

import { AesLogo } from '@nina-aes/ui/components/brand/aes-logo';
import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Calendar, FileSearch, MessageSquareWarning, PencilLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { normalizeLocale } from '@nina-aes/i18n';
import { NinaHeroSearch } from './_components/nina-hero-search';
import { LanguageSwitcher } from './_components/language-switcher';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeContent locale={normalizeLocale(locale)} />;
}

function HomeContent({ locale }: { locale: ReturnType<typeof normalizeLocale> }) {
  const t = useTranslations('citizen.home');
  const tCommon = useTranslations('common');

  const actions = [
    { icon: FileSearch, key: 'viewCard', href: 'nina', tone: 'primary' as const },
    { icon: PencilLine, key: 'requestCorrection', href: 'corrections/new', tone: 'warning' as const },
    { icon: Calendar, key: 'bookAppointment', href: 'appointments/new', tone: 'success' as const },
    {
      icon: MessageSquareWarning,
      key: 'reportCorruption',
      href: 'reports/new',
      tone: 'danger' as const,
    },
  ];

  return (
    <main>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="citizen-hero-bg border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <AesLogo size="md" />
            <div className="flex items-center gap-3">
              <LanguageSwitcher currentLocale={locale} />
              <Link
                href="#actions"
                className="rounded-base bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary/90"
              >
                {tCommon('signIn')}
              </Link>
            </div>
          </div>

          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-fg-muted sm:text-xl">{t('subtitle')}</p>

          <div className="mt-8 max-w-xl">
            <NinaHeroSearch />
          </div>
        </div>
      </section>

      {/* ── 4 cartes d'action ─────────────────────────────────────────────── */}
      <section id="actions" className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(({ icon: Icon, key, href, tone }) => (
            <Link key={key} href={`./${href}`} className="block focus:outline-none">
              <Card className="h-full transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                <CardHeader>
                  <Icon
                    className={
                      tone === 'primary'
                        ? 'h-8 w-8 text-primary'
                        : tone === 'warning'
                          ? 'h-8 w-8 text-warning'
                          : tone === 'success'
                            ? 'h-8 w-8 text-success'
                            : 'h-8 w-8 text-destructive'
                    }
                    aria-hidden="true"
                  />
                  <CardTitle className="mt-2 text-lg">{t(`actions.${key}`)}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-fg-muted">→</CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Footer minimal ────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-bg-muted/40">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-fg-muted sm:px-6 lg:px-8">
          <p>
            © 2026 NINA-AES · <span className="font-medium">{tCommon('appName')}</span> · CTDEC · DNEC
            ·{' '}
            <span className="font-mono text-xs">
              🇲🇱 🇧🇫 🇳🇪
            </span>
          </p>
        </div>
      </footer>
    </main>
  );
}
