/**
 * @file        signed-message-bubble.tsx
 * @description Bulle de message officiel à signature électronique (messagerie
 *              GOV-01). La signature est un JWS RS256 apposé côté serveur (Vault
 *              Transit, ADR-026/034) — jamais côté client. Props-driven ; badge
 *              de signature (vérifiée / absente). L'identifiant de clé (`kid`)
 *              est exposé via `title` natif (pas de dépendance Tooltip).
 * @module      @nina-aes/ui
 */

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SignedMessageBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  author: string;
  timestamp: string;
  body: string;
  /** `sent` = émis par soi (aligné à droite). */
  variant?: 'sent' | 'received';
  /** Résultat de `verifySignature()`. */
  signatureValid?: boolean;
  /** Identifiant de clé de signature (`kid` Vault Transit) — affiché en infobulle. */
  fingerprint?: string;
  /** Accusé de lecture (côté émis). */
  readAtLabel?: string;
}

/** Bulle de message signée pour la messagerie officielle sécurisée. */
export const SignedMessageBubble = React.forwardRef<HTMLDivElement, SignedMessageBubbleProps>(
  (
    {
      author,
      timestamp,
      body,
      variant = 'received',
      signatureValid = true,
      fingerprint,
      readAtLabel,
      className,
      ...props
    },
    ref,
  ) => {
    const sent = variant === 'sent';
    return (
      <div
        ref={ref}
        className={cn('flex', sent ? 'justify-end' : 'justify-start', className)}
        {...props}
      >
        <div
          className={cn(
            'max-w-[80%] rounded-lg p-3 shadow-sm',
            sent ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg',
          )}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold">{author}</span>
            <span className={cn('text-xs', sent ? 'text-primary-fg/70' : 'text-fg-muted')}>
              {timestamp}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{body}</p>
          <div className="mt-2 flex items-center gap-2">
            {signatureValid ? (
              <span
                title={
                  fingerprint
                    ? `Clé de signature : ${fingerprint} — vérifiée (JWS)`
                    : 'Signature électronique vérifiée (JWS)'
                }
                className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
              >
                <ShieldCheck className="size-3" aria-hidden="true" />
                JWS ✓
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                <ShieldAlert className="size-3" aria-hidden="true" />
                Signature absente
              </span>
            )}
            {sent && readAtLabel && (
              <span className="text-[10px] text-primary-fg/70">{readAtLabel}</span>
            )}
          </div>
        </div>
      </div>
    );
  },
);
SignedMessageBubble.displayName = 'SignedMessageBubble';
