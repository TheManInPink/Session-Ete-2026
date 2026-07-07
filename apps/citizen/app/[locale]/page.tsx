/**
 * @file        [locale]/page.tsx
 * @description Écran PC-01 — Accueil citoyen (charte + spec PC-01).
 *              Chrome (SiteHeader nav + SiteFooter) + hero tricolore AES
 *              (drapeaux + NinaHeroSearch + accroche de confiance qualitative)
 *              + 4 cartes d'action décrites + section « Comment ça marche »
 *              (3 étapes) + FAQ (Accordion).
 *
 *              Choix : hero clair tricolore (§1.5 + contraste sous le header
 *              navy), pas de chiffres fabriqués (principe données honnêtes).
 *
 *              Conformité spec : docs/design-system/screens.md §PC-01.
 *
 * @module      @nina-aes/citizen
 */

import { Card, CardContent, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { CountryFlag } from '@nina-aes/ui/components/brand/country-flag';
import { Calendar, FileText, Lock, Search, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import { normalizeLocale } from '@nina-aes/i18n';
import { getSession } from '../../lib/auth/session';
import { NinaHeroSearch } from './_components/nina-hero-search';
import { SiteHeader, type SiteHeaderUser } from './_components/site-header';
import { SiteFooter } from './_components/site-footer';
import { FaqSection } from './_components/faq-section';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // La home est publique, mais si une session existe (citoyen connecté ou mode
  // démo), l'en-tête affiche son menu + la déconnexion.
  const session = await getSession();
  const user: SiteHeaderUser | null = session
    ? { name: session.user.name, nina: session.user.nina, email: session.user.email }
    : null;

  return <HomeContent locale={normalizeLocale(locale)} user={user} />;
}

/** Cartes d'action rapides (icône spec PC-01 + tonalité sémantique). */
const ACTIONS = [
  { icon: Search, key: 'viewCard', href: 'nina', tone: 'primary' as const },
  {
    // Le wizard de correction (PC-03) vit sous /nina/[nina]/correction et exige
    // un NINA : on passe par la recherche avec `intent=correction`.
    icon: FileText,
    key: 'requestCorrection',
    href: 'nina?intent=correction',
    tone: 'warning' as const,
  },
  { icon: Calendar, key: 'bookAppointment', href: 'appointments/new', tone: 'success' as const },
  { icon: Shield, key: 'reportCorruption', href: 'signalement', tone: 'danger' as const },
];

const STEPS = ['1', '2', '3'] as const;

function iconTone(tone: 'primary' | 'warning' | 'success' | 'danger'): string {
  switch (tone) {
    case 'primary':
      return 'text-primary';
    case 'warning':
      return 'text-warning';
    case 'success':
      return 'text-success';
    default:
      return 'text-destructive';
  }
}

function HomeContent({
  locale,
  user,
}: {
  locale: ReturnType<typeof normalizeLocale>;
  user: SiteHeaderUser | null;
}) {
  const t = useTranslations('citizen.home');
  const tHow = useTranslations('citizen.home.howItWorks');

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader locale={locale} user={user} />

      <main className="flex-1">
        {/* ── Hero tricolore ────────────────────────────────────────────── */}
        <section className="citizen-hero-bg border-b border-border">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
            <span
              className="inline-flex items-center gap-1.5 duration-700 animate-in fade-in slide-in-from-bottom-2"
              role="img"
              aria-label="Alliance des États du Sahel"
            >
              <CountryFlag country="MLI" size={28} />
              <CountryFlag country="BFA" size={28} />
              <CountryFlag country="NER" size={28} />
            </span>

            <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t('title')}
            </h1>
            <p className="mt-3 max-w-2xl text-lg text-fg-muted sm:text-xl">{t('subtitle')}</p>

            <div className="mt-8 max-w-xl">
              <NinaHeroSearch />
            </div>

            <Badge className="mt-5 gap-1.5 bg-bg-card/80 font-normal text-fg-muted">
              <Lock className="size-3.5" aria-hidden="true" />
              {t('trustBadge')}
            </Badge>
          </div>
        </section>

        {/* ── 4 cartes d'action ─────────────────────────────────────────── */}
        <section id="actions" className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ACTIONS.map(({ icon: Icon, key, href, tone }) => (
              // Href absolu préfixé locale : un `./…` relatif depuis `/fr` perd
              // le préfixe et coûte un 307 de re-localisation au proxy.
              <Link key={key} href={`/${locale}/${href}`} className="block focus:outline-none">
                <Card className="h-full transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
                  <CardHeader>
                    <Icon className={`h-8 w-8 ${iconTone(tone)}`} aria-hidden="true" />
                    <CardTitle className="mt-2 text-lg">{t(`actions.${key}`)}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-fg-muted">
                    {t(`actionsDesc.${key}`)}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Comment ça marche ─────────────────────────────────────────── */}
        <section className="border-t border-border bg-bg-muted/40">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-semibold tracking-tight">{tHow('title')}</h2>
            <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {STEPS.map((n) => (
                <li key={n} className="rounded-lg border border-border bg-bg-card p-6">
                  <span
                    className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-fg"
                    aria-hidden="true"
                  >
                    {n}
                  </span>
                  <h3 className="mt-4 font-semibold">{tHow(`step${n}Title`)}</h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{tHow(`step${n}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <FaqSection />
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
