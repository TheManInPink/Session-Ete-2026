/**
 * @file        unavailable-card.tsx
 * @description Carte « donnée indisponible » — rendu dégradé HONNÊTE quand une
 *              section du contrat `AdminDashboardStats` vaut `null` (aucune
 *              source backend : agrégation Bloc D non implémentée).
 *
 *              Composant purement présentationnel (utilisable en RSC comme en
 *              client) : les libellés localisés sont passés en props par la
 *              page appelante.
 *
 * @module      @nina-aes/admin
 */

import { Card, CardContent } from '@nina-aes/ui/components/card';
import { CircleOff } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';

/**
 * Affiche l'état « indisponible — module Bloc D à venir » d'une section.
 *
 * @param title - Titre localisé de la section indisponible.
 * @param body  - Explication localisée (source backend absente).
 */
export function UnavailableCard({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <Card className={cn('border-dashed', className)}>
      <CardContent className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <span
          className="flex size-10 items-center justify-center rounded-full bg-bg-muted text-fg-muted"
          aria-hidden="true"
        >
          <CircleOff className="size-5" />
        </span>
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="max-w-sm text-sm text-fg-muted">{body}</p>
      </CardContent>
    </Card>
  );
}
