/**
 * @file        nina-display.tsx
 * @description Affichage formaté d'un NINA (groupé / compact / masqué) avec
 *              bouton copier optionnel. Utilise formatNina/maskNina de utils.
 * @module      @nina-aes/ui
 */

'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { formatNina, maskNina, normalizeNina } from '@nina-aes/utils';

import { cn } from '../../lib/utils';

const ninaTextVariants = cva('font-mono tracking-wide text-fg', {
  variants: { size: { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' } },
  defaultVariants: { size: 'md' },
});

export interface NinaDisplayProps extends VariantProps<typeof ninaTextVariants> {
  nina: string;
  /** `grouped` = « X YY ZZ … A » ; `compact` = sans espaces. */
  format?: 'grouped' | 'compact';
  /** Masque les chiffres centraux (logs/affichage public). */
  masked?: boolean;
  /** Affiche un bouton de copie (copie toujours la forme compacte). */
  copyable?: boolean;
  className?: string;
}

/** Affiche un NINA dans le format demandé, copiable. */
export function NinaDisplay({
  nina,
  format = 'grouped',
  masked = false,
  copyable = false,
  size,
  className,
}: NinaDisplayProps) {
  const [copied, setCopied] = React.useState(false);
  const compact = normalizeNina(nina);
  const value = masked ? maskNina(nina) : format === 'grouped' ? formatNina(nina) : compact;

  const handleCopy = () => {
    void navigator.clipboard?.writeText(compact);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn(ninaTextVariants({ size }), masked && 'italic text-fg-muted')}>
        {value}
      </span>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'NINA copié' : 'Copier le NINA'}
          className="text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
        >
          {copied ? (
            <Check className="size-4 text-success" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </button>
      )}
    </span>
  );
}
NinaDisplay.displayName = 'NinaDisplay';
