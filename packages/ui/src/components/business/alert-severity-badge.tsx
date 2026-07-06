/**
 * @file        alert-severity-badge.tsx
 * @description Badge de sévérité d'alerte SIGAC (AD-03). Couleur + icône par
 *              niveau. Tokens sémantiques uniquement.
 * @module      @nina-aes/ui
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { AlertOctagon, AlertTriangle, Bell, Info, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

/** Niveaux alignés sur l'enum `AlertSeverity` de @nina-aes/shared-types. */
export type AlertSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const SEVERITY: Record<AlertSeverity, { label: string; Icon: LucideIcon; classes: string }> = {
  INFO: { label: 'Info', Icon: Info, classes: 'bg-info/10 text-info' },
  LOW: { label: 'Faible', Icon: Bell, classes: 'bg-bg-muted text-fg-muted' },
  MEDIUM: { label: 'Moyen', Icon: AlertTriangle, classes: 'bg-warning/15 text-warning' },
  HIGH: { label: 'Élevé', Icon: AlertTriangle, classes: 'bg-warning text-bg' },
  CRITICAL: {
    label: 'Critique',
    Icon: AlertOctagon,
    classes: 'bg-destructive text-destructive-fg',
  },
};

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide',
  {
    variants: {
      size: { sm: 'h-6 px-2 text-[10px]', md: 'h-7 px-2.5 text-xs', lg: 'h-8 px-3 text-sm' },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface AlertSeverityBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  severity: AlertSeverity;
  /** Affiche le libellé textuel (sinon icône seule). */
  showLabel?: boolean;
}

/** Pastille colorée représentant la sévérité d'une alerte. */
export function AlertSeverityBadge({
  severity,
  size,
  showLabel = true,
  className,
  ...props
}: AlertSeverityBadgeProps) {
  const { label, Icon, classes } = SEVERITY[severity];
  return (
    <span className={cn(badgeVariants({ size }), classes, className)} {...props}>
      <Icon className="size-3.5" aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
AlertSeverityBadge.displayName = 'AlertSeverityBadge';
