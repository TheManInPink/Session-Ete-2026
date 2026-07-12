/**
 * @file        app-footer.tsx
 * @description Pied de page partagé NINA-AES — mention © + drapeaux SVG de
 *              l'Alliance des États du Sahel. Purement présentationnel (aucun
 *              hook) : utilisable en RSC comme en Client Component. Les libellés
 *              (nom du portail, rattachement) sont passés en props par l'app.
 * @module      @nina-aes/ui
 */

import * as React from 'react';

import { cn } from '../../lib/utils';
import { CountryFlag } from '../brand/country-flag';

export interface AppFooterProps extends React.HTMLAttributes<HTMLElement> {
  /** Nom du portail (ex. « Console agent », « Portail citoyen »). */
  appName: string;
  /** Rattachement institutionnel affiché ensuite (ex. « CTDEC · DNEC »). */
  org?: string;
}

/** Pied de page institutionnel commun aux 3 apps. */
export function AppFooter({ appName, org, className, ...props }: AppFooterProps) {
  return (
    <footer className={cn('border-t border-border bg-bg-muted/40', className)} {...props}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 text-sm text-fg-muted sm:px-6">
        <p>
          © 2026 <span className="font-semibold text-fg">NINA-AES</span> · {appName}
          {org ? <> · {org}</> : null}
        </p>
        <span
          className="inline-flex items-center gap-1.5"
          role="img"
          aria-label="Alliance des États du Sahel : Mali, Burkina Faso, Niger"
        >
          <CountryFlag country="MLI" size={16} />
          <CountryFlag country="BFA" size={16} />
          <CountryFlag country="NER" size={16} />
        </span>
      </div>
    </footer>
  );
}
AppFooter.displayName = 'AppFooter';
