/**
 * @file        app-sidebar.tsx
 * @description Barre de navigation latérale partagée des consoles NINA-AES
 *              (admin CTDEC + portail gouvernance). Structure unique :
 *              bandeau marque (+ drapeaux AES) · navigation · bloc profil
 *              (avatar initiales + rôle) · déconnexion.
 *
 *              Responsive :
 *                • ≥ lg — sidebar fixe (`hidden lg:flex`) ;
 *                • < lg — barre supérieure fixe avec bouton burger ouvrant un
 *                  drawer (`Sheet`) qui reprend exactement le même contenu ; un
 *                  clic sur un lien referme le drawer.
 *
 *              Framework-agnostique (le design system ne dépend pas de Next) :
 *              le `pathname` courant et le composant de lien (`linkComponent`,
 *              ex. `next/link`) sont fournis par un wrapper applicatif.
 *
 *              Déconnexion : `<form method="post">` vers la route API serveur
 *              (pas un lien, qui serait préchargé au survol).
 *
 * @module      @nina-aes/ui
 */

'use client';

import * as React from 'react';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { CountryFlag } from '../brand/country-flag';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '../ui/sheet';

export interface AppSidebarNavItem {
  key: string;
  /** Href complet, préfixé locale (ex. `/fr/dashboard`). */
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface AppSidebarProfile {
  /** Initiales affichées dans la pastille avatar. */
  initials: string;
  name: string;
  /** Libellé de rôle affiché au-dessus du nom (ex. « Superviseur »). */
  roleLabel?: string;
  /** Lignes de méta sous le nom (matricule, centre…). */
  metaLines?: string[];
}

export interface AppSidebarProps {
  /** Classe de surface (couleur de fond), ex. `admin-sidebar`. */
  className?: string;
  /** Sur-titre du bandeau marque (ex. « Console agent »). */
  brandEyebrow: string;
  brandSubtitle: string;
  navLabel: string;
  items: AppSidebarNavItem[];
  profile: AppSidebarProfile;
  logoutLabel: string;
  /** Cible du form de déconnexion. Défaut : route API serveur. */
  logoutAction?: string;
  /** Chemin courant (l'app le fournit via `usePathname()`). */
  pathname: string;
  /** Composant de lien (ex. `next/link`). Défaut : ancre `<a>`. */
  linkComponent?: React.ElementType;
}

type SidebarBodyProps = Omit<AppSidebarProps, 'className'> & {
  /** Appelé au clic d'un lien (referme le drawer mobile). */
  onNavigate?: () => void;
};

/** Contenu interne commun au desktop (aside) et au drawer mobile. */
function SidebarBody({
  brandEyebrow,
  brandSubtitle,
  navLabel,
  items,
  profile,
  logoutLabel,
  logoutAction = '/api/auth/logout',
  pathname,
  linkComponent,
  onNavigate,
}: SidebarBodyProps) {
  const LinkComponent = linkComponent ?? 'a';

  return (
    <>
      {/* ── Bandeau marque ─────────────────────────────────────────────── */}
      <div className="border-b border-white/10 px-4 py-5">
        <p className="text-xs uppercase tracking-wider text-white/60">{brandEyebrow}</p>
        <p className="mt-1 text-lg font-bold">NINA-AES</p>
        <p className="text-xs text-white/50">{brandSubtitle}</p>
        <span
          className="mt-2.5 inline-flex items-center gap-1"
          role="img"
          aria-label="Alliance des États du Sahel"
        >
          <CountryFlag country="MLI" size={14} />
          <CountryFlag country="BFA" size={14} />
          <CountryFlag country="NER" size={14} />
        </span>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" aria-label={navLabel}>
        {items.map(({ key, href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <LinkComponent
              key={key}
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-base py-2 pl-2 pr-3 text-sm transition-colors hover:bg-white/10',
                isActive ? 'bg-white/15 font-medium text-white' : 'text-white/80',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-5 w-0.5 shrink-0 rounded-full transition-colors',
                  isActive ? 'bg-white' : 'bg-transparent',
                )}
              />
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </LinkComponent>
          );
        })}
      </nav>

      {/* ── Profil + déconnexion ───────────────────────────────────────── */}
      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-3 flex items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white"
            aria-hidden="true"
          >
            {profile.initials}
          </span>
          <div className="min-w-0">
            {profile.roleLabel && (
              <p className="truncate text-[11px] uppercase tracking-wider text-white/50">
                {profile.roleLabel}
              </p>
            )}
            <p className="truncate text-sm font-medium text-white">{profile.name}</p>
            {profile.metaLines?.map((line) => (
              <p key={line} className="truncate text-xs text-white/50">
                {line}
              </p>
            ))}
          </div>
        </div>
        <form action={logoutAction} method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-base px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span>{logoutLabel}</span>
          </button>
        </form>
      </div>
    </>
  );
}

/** Barre supérieure mobile (< lg) : burger + drawer reprenant la sidebar. */
function AppSidebarMobile({ className, ...body }: AppSidebarProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg-card px-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={body.navLabel}
            className="inline-flex size-9 items-center justify-center rounded-base text-fg transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </SheetTrigger>
        {/* p-0 + wrapper interne `h-full` portant la classe de surface : ce
            wrapper recouvre le `bg-bg-card` du SheetContent (que la couche
            utilities de Tailwind ferait sinon gagner sur `.*-sidebar`).
            `aria-describedby={undefined}` = opt-out Radix : le drawer a un
            titre (SheetTitle) mais pas de description séparée. */}
        <SheetContent
          side="left"
          hideCloseButton
          aria-describedby={undefined}
          className="w-72 max-w-[85%] p-0"
        >
          <div className={cn('flex h-full flex-col', className)}>
            <SheetTitle className="sr-only">{body.brandEyebrow}</SheetTitle>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Fermer"
                className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-base text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </SheetClose>
            <SidebarBody {...body} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-fg">NINA-AES</span>
        <span className="hidden text-xs text-fg-muted sm:inline">{body.brandEyebrow}</span>
      </div>
    </header>
  );
}

export function AppSidebar({ className, ...body }: AppSidebarProps) {
  return (
    <>
      {/* Desktop : sidebar fixe */}
      <aside className={cn('hidden h-screen w-64 shrink-0 flex-col lg:flex', className)}>
        <SidebarBody {...body} />
      </aside>
      {/* Mobile : barre + drawer */}
      <AppSidebarMobile className={className} {...body} />
    </>
  );
}
AppSidebar.displayName = 'AppSidebar';
