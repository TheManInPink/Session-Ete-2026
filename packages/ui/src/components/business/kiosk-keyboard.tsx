/**
 * @file        kiosk-keyboard.tsx
 * @description Clavier tactile virtuel (Bloc E — bornes Electron + USSD).
 *              Cibles tactiles ≥64px (WCAG 2.5.5 Taille de la cible).
 *              Conteneur role="group" ; touches icône-only avec aria-label.
 * @module      @nina-aes/ui
 */

'use client';

import { CornerDownLeft, Delete, Space, ArrowBigUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

/** Variante de disposition du clavier. */
export type KioskKeyboardVariant = 'numeric' | 'azerty' | 'nina';

/** Progression saisie (en-tête de la variante NINA). */
export interface KioskKeyboardProgress {
  /** Nombre de caractères déjà saisis. */
  current: number;
  /** Nombre total de caractères attendus. */
  total: number;
}

export interface KioskKeyboardProps
  // On omet le `onKeyPress` natif (KeyboardEventHandler du DOM) car notre API
  // expose un `onKeyPress(key: string)` métier, incompatible avec sa signature.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onKeyPress'> {
  /** Disposition du clavier. @default 'numeric' */
  variant?: KioskKeyboardVariant;
  /** Appelé avec le caractère saisi pour chaque touche de caractère. */
  onKeyPress: (key: string) => void;
  /** Touche « Effacer / Retour arrière ». */
  onBackspace?: () => void;
  /** Touche « Entrée » (variante azerty). */
  onEnter?: () => void;
  /** Touche « Maj » (variante azerty). */
  onShift?: () => void;
  /** Progression affichée en en-tête (variante nina). */
  progress?: KioskKeyboardProgress;
  /** Désactive entièrement le clavier. */
  disabled?: boolean;
}

/**
 * Classes communes à toute touche : cible tactile généreuse, fond doux,
 * survol primaire, retour tactile rapide (active:scale-95, motion ~75ms),
 * anneau de focus visible au clavier.
 */
const KEY_BASE = cn(
  'inline-flex items-center justify-center select-none',
  'bg-bg-muted text-fg rounded-base font-medium',
  'transition-transform duration-75 hover:bg-primary/10 active:scale-95',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
);

/** Alphabet NINA : A-Z privé de I et O (lettres de contrôle ambiguës). */
const NINA_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('');
/** Chiffres 0-9 réutilisés par les variantes numeric et nina. */
const DIGITS = '0123456789'.split('');

/**
 * Clavier tactile virtuel pour les bornes en libre-service (Bloc E).
 *
 * @example
 *   <KioskKeyboard variant="numeric" onKeyPress={(k) => append(k)} onBackspace={pop} />
 *   <KioskKeyboard variant="nina" progress={{ current: 6, total: 13 }} onKeyPress={append} />
 */
export const KioskKeyboard = React.forwardRef<HTMLDivElement, KioskKeyboardProps>(
  (
    {
      variant = 'numeric',
      onKeyPress,
      onBackspace,
      onEnter,
      onShift,
      progress,
      disabled = false,
      className,
      ...props
    },
    ref,
  ) => {
    /** Touche de caractère générique (chiffre ou lettre). */
    const charKey = (char: string, sizeCls: string, textCls: string) => (
      <button
        key={char}
        type="button"
        disabled={disabled}
        onClick={() => onKeyPress(char)}
        className={cn(KEY_BASE, sizeCls, textCls)}
      >
        {char}
      </button>
    );

    return (
      <div
        ref={ref}
        role="group"
        aria-label="Clavier virtuel"
        className={cn(
          'flex flex-col gap-2',
          disabled && 'pointer-events-none opacity-50',
          className,
        )}
        {...props}
      >
        {/* ---------- Variante NUMERIC : pavé téléphone 3 colonnes ---------- */}
        {variant === 'numeric' && (
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
              charKey(d, 'size-20', 'text-2xl'),
            )}
            {/* Dernière rangée : Effacer / 0 / # */}
            <button
              type="button"
              disabled={disabled}
              onClick={onBackspace}
              aria-label="Effacer"
              className={cn(KEY_BASE, 'size-20')}
            >
              <Delete className="size-7" aria-hidden="true" />
            </button>
            {charKey('0', 'size-20', 'text-2xl')}
            {charKey('#', 'size-20', 'text-2xl')}
          </div>
        )}

        {/* ---------- Variante AZERTY : 4 rangées ---------- */}
        {variant === 'azerty' && (
          <div className="flex flex-col gap-2">
            {/* Rangée 1 */}
            <div className="flex gap-2">
              {'azertyuiop'.split('').map((c) => charKey(c, 'size-16', 'text-xl'))}
            </div>
            {/* Rangée 2 */}
            <div className="flex gap-2">
              {'qsdfghjklm'.split('').map((c) => charKey(c, 'size-16', 'text-xl'))}
            </div>
            {/* Rangée 3 : Shift + lettres + Retour arrière */}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={onShift}
                aria-label="Majuscule"
                className={cn(KEY_BASE, 'size-16')}
              >
                <ArrowBigUp className="size-7" aria-hidden="true" />
              </button>
              {'wxcvbn'.split('').map((c) => charKey(c, 'size-16', 'text-xl'))}
              <button
                type="button"
                disabled={disabled}
                onClick={onBackspace}
                aria-label="Retour arrière"
                className={cn(KEY_BASE, 'size-16')}
              >
                <Delete className="size-7" aria-hidden="true" />
              </button>
            </div>
            {/* Rangée 4 : Espace (large) + Entrée */}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onKeyPress(' ')}
                aria-label="Espace"
                className={cn(KEY_BASE, 'h-16 flex-1')}
              >
                <Space className="size-7" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={onEnter}
                aria-label="Entrée"
                className={cn(KEY_BASE, 'h-16 px-6')}
              >
                <CornerDownLeft className="size-7" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ---------- Variante NINA : chiffres + A-Z sauf I/O ---------- */}
        {variant === 'nina' && (
          <div className="flex flex-col gap-2">
            {progress && (
              <p className="text-sm text-fg-muted">
                {progress.current}/{progress.total} caractères
              </p>
            )}
            <div className="grid grid-cols-6 gap-2">
              {DIGITS.map((d) => charKey(d, 'size-16', 'text-xl'))}
              {NINA_LETTERS.map((c) => charKey(c, 'size-16', 'text-lg'))}
              <button
                type="button"
                disabled={disabled}
                onClick={onBackspace}
                aria-label="Retour arrière"
                className={cn(KEY_BASE, 'size-16')}
              >
                <Delete className="size-6" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);
KioskKeyboard.displayName = 'KioskKeyboard';
