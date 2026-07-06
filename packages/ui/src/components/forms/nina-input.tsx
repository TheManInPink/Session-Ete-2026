/**
 * @file        nina-input.tsx
 * @description Composant NinaInput — saisie d'un NINA (15 caractères) avec :
 *                - Normalisation live (uppercase, suppression espaces/tirets)
 *                - Validation format + lettre de contrôle via @nina-aes/utils
 *                - Police monospace pour lisibilité
 *                - Accessibilité (aria-invalid, aria-describedby)
 *
 * @module      @nina-aes/ui
 */

'use client';

import { normalizeNina, validateNina, type ParsedNina } from '@nina-aes/utils';
import * as React from 'react';
import { cn } from '../../lib/utils';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export interface NinaInputProps {
  /** Identifiant HTML (par défaut "nina"). */
  id?: string;
  /** Étiquette affichée (sinon "Numéro NINA"). */
  label?: string;
  /** Aide affichée sous l'input. */
  helper?: string;
  /** Valeur contrôlée. */
  value?: string;
  /** Callback sur chaque saisie (valeur normalisée). */
  onChange?: (value: string) => void;
  /** Callback déclenché uniquement quand le NINA est entièrement valide. */
  onValid?: (parsed: ParsedNina) => void;
  /** Désactive l'input. */
  disabled?: boolean;
  /** Force le focus automatique au mount. */
  autoFocus?: boolean;
  /** Classes additionnelles pour le container. */
  className?: string;
  /** Texte d'erreur custom (par défaut, message auto si NINA invalide). */
  errorMessage?: string;
}

/**
 * Input NINA-AES — saisie d'un Numéro d'Identification Nationale du Mali.
 *
 * Format : 14 chiffres + 1 lettre de contrôle (15 caractères au total).
 *
 * @example
 *   <NinaInput onValid={(p) => console.log(p.lettreControle)} />
 */
export function NinaInput({
  id = 'nina',
  label = 'Numéro NINA',
  helper = '14 chiffres + 1 lettre de contrôle (15 caractères au total)',
  value: controlled,
  onChange,
  onValid,
  disabled,
  autoFocus,
  className,
  errorMessage,
}: NinaInputProps) {
  const [internal, setInternal] = React.useState('');
  const value = controlled ?? internal;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  const isComplete = value.length === 15;
  const isFullyValid = isComplete && validateNina(value);
  const hasError = isComplete && !isFullyValid;

  const display = errorMessage ?? (hasError ? 'Lettre de contrôle invalide' : null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const normalized = normalizeNina(e.target.value).slice(0, 15);
    if (controlled === undefined) setInternal(normalized);
    onChange?.(normalized);
    if (normalized.length === 15 && validateNina(normalized) && onValid) {
      // Lazy parse pour éviter le coût si pas de listener
      import('@nina-aes/utils').then(({ parseNina }) => onValid(parseNina(normalized)));
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={15}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoFocus={autoFocus}
        invalid={hasError}
        valid={isFullyValid}
        aria-describedby={cn(helperId, hasError && errorId).trim() || undefined}
        className="font-mono tracking-wider uppercase"
        placeholder="18903102015042V"
      />
      {display ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {display}
        </p>
      ) : (
        <p id={helperId} className="text-xs text-fg-muted">
          {helper}
        </p>
      )}
    </div>
  );
}
