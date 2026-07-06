/**
 * @file        citizen-card.tsx
 * @description Carte profil citoyen (PC-02, AD-02) — photo/initiales, identité,
 *              NINA copiable, filiation/résidence, badge « FDI vérifiée », actions.
 *              Réutilise Avatar + NinaDisplay du design system.
 * @module      @nina-aes/ui
 */

import { ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { NinaDisplay } from './nina-display';

export interface CitizenCardProps extends React.HTMLAttributes<HTMLDivElement> {
  firstName: string;
  lastName: string;
  nina: string;
  /** Ligne secondaire (ex. « née le 15/03/1989 · Féminin · Célibataire »). */
  subtitle?: string;
  profession?: string;
  /** Hiérarchie de résidence prête à afficher (ex. « Mali › Bamako › … »). */
  residencePath?: string;
  photoUrl?: string;
  /** Affiche le badge « FDI vérifiée ». */
  verified?: boolean;
  /** Boutons d'action (ex. télécharger FDI, signaler une erreur). */
  actions?: React.ReactNode;
}

/** Carte profil large d'un citoyen. */
export const CitizenCard = React.forwardRef<HTMLDivElement, CitizenCardProps>(
  (
    {
      firstName,
      lastName,
      nina,
      subtitle,
      profession,
      residencePath,
      photoUrl,
      verified,
      actions,
      className,
      ...props
    },
    ref,
  ) => {
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    return (
      <article
        ref={ref}
        className={cn('rounded-lg border border-border bg-bg-card p-6 shadow-sm', className)}
        {...props}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar size="2xl" className="rounded-xl">
            {photoUrl && <AvatarImage src={photoUrl} alt={`${firstName} ${lastName}`} />}
            <AvatarFallback className="rounded-xl bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-2xl font-bold text-fg">
                {firstName} {lastName.toUpperCase()}
              </h3>
              {verified && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  FDI vérifiée
                </span>
              )}
            </div>
            {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
            <NinaDisplay nina={nina} format="grouped" size="md" copyable />
            {profession && <p className="text-sm font-medium text-fg">{profession}</p>}
            {residencePath && <p className="text-sm text-fg-muted">{residencePath}</p>}
          </div>
        </div>

        {actions && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row">
            {actions}
          </div>
        )}
      </article>
    );
  },
);
CitizenCard.displayName = 'CitizenCard';
