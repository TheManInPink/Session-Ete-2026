/**
 * @file        ussd-simulator.tsx
 * @description Simulateur USSD (USSD-01, outil de développement) — maquette de
 *              feature phone : coque sombre, écran LCD monospace et pavé
 *              numérique virtuel piloté en mode contrôlé. Un panneau debug
 *              optionnel expose l'état de la session côté passerelle.
 *              A11y : l'écran LCD est annoncé via role="status"/aria-live pour
 *              que les changements de menu soient lus ; le panneau debug est un
 *              <aside> complémentaire ignorable au clavier.
 * @module      @nina-aes/ui
 */

'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';
import { KioskKeyboard } from './kiosk-keyboard';
import { Button } from '../ui/button';

/** Détails techniques de la session USSD affichés dans le panneau debug. */
export interface UssdSimulatorDebug {
  /** Identifiant de session USSD (sessionId passerelle). */
  sessionId?: string;
  /** Texte accumulé des saisies successives (ex. « 1*2*3 »). */
  accumulatedText?: string;
  /** Dernière réponse renvoyée par le serveur (CON/END …). */
  lastResponse?: string;
  /** Représentation de l'appel API courant (méthode + endpoint). */
  apiCall?: string;
}

// `Omit<…, 'onInput'>` : notre `onInput(value: string)` remplace le handler DOM
// natif `onInput` (signature évènementielle) qui serait sinon incompatible (TS2430).
export interface UssdSimulatorProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onInput'> {
  /** Contenu affiché sur l'écran LCD (multi-lignes, rendu pré-formaté). */
  screenText: string;
  /** Ligne d'état en haut de l'écran. @default '📶📵  NINA-AES  12:34' */
  statusText?: string;
  /** Saisie courante (clavier contrôlé par le parent). */
  input?: string;
  /** Appelé à chaque touche : le parent recompose la saisie (append/backspace). */
  onInput?: (value: string) => void;
  /** Appelé lors de l'appui sur « Répondre » avec la saisie courante. */
  onReply?: (input: string) => void;
  /** Appelé lors de l'appui sur « Annuler ». */
  onCancel?: () => void;
  /** Affiche le pavé numérique virtuel. @default true */
  showKeypad?: boolean;
  /** Détails de session à inspecter dans le panneau debug latéral. */
  debug?: UssdSimulatorDebug;
}

/**
 * Maquette interactive d'un parcours USSD pour le développement et la démo.
 *
 * Le clavier est entièrement contrôlé : `onInput` reçoit la nouvelle valeur
 * complète (chiffre ajouté ou dernier caractère retiré) à propager au parent.
 *
 * @example
 *   <UssdSimulator
 *     screenText={"CON Bienvenue sur NINA\n1. S'inscrire\n2. Vérifier"}
 *     input={input}
 *     onInput={setInput}
 *     onReply={(v) => sendReply(v)}
 *     onCancel={resetSession}
 *     debug={{ sessionId, accumulatedText, apiCall: 'POST /ussd' }}
 *   />
 */
export const UssdSimulator = React.forwardRef<HTMLDivElement, UssdSimulatorProps>(
  (
    {
      screenText,
      statusText = '📶📵  NINA-AES  12:34',
      input,
      onInput,
      onReply,
      onCancel,
      showKeypad = true,
      debug,
      className,
      ...props
    },
    ref,
  ) => {
    // Saisie normalisée : évite de répéter `input ?? ''` à chaque usage.
    const current = input ?? '';

    return (
      <div ref={ref} className={cn('flex flex-wrap items-start gap-6', className)} {...props}>
        {/* ---------- Combiné (feature phone) ---------- */}
        <div className="mx-auto w-[320px] rounded-lg bg-fg p-4 text-bg shadow-lg">
          {/* Écran LCD : 1ère ligne = état, puis le contenu pré-formaté. */}
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'min-h-40 whitespace-pre-wrap rounded-sm border-4 border-fg bg-warning/20',
              'p-3 font-mono text-xs text-fg',
            )}
          >
            <p className="mb-2 opacity-80">{statusText}</p>
            {screenText}
          </div>

          {/* Saisie courante (affichée seulement si renseignée). */}
          {current.length > 0 && (
            <p className="mt-2 break-all font-mono text-bg" aria-label="Saisie courante">
              {current}
            </p>
          )}

          {/* Actions sous l'écran. */}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="solid" onClick={() => onReply?.(current)}>
              Répondre
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Annuler
            </Button>
          </div>

          {/* Pavé numérique virtuel (contrôlé). */}
          {showKeypad && (
            <KioskKeyboard
              variant="numeric"
              onKeyPress={(k) => onInput?.(current + k)}
              onBackspace={() => onInput?.(current.slice(0, -1))}
              className="mx-auto mt-4 scale-90"
            />
          )}
        </div>

        {/* ---------- Panneau debug (optionnel) ---------- */}
        {debug && (
          <aside
            aria-label="Détails de session USSD"
            className="w-72 space-y-1 rounded-base bg-bg-muted p-4 font-mono text-xs text-fg-muted"
          >
            <p>
              <span className="text-fg">sessionId :</span> {debug.sessionId ?? '—'}
            </p>
            <p>
              <span className="text-fg">accumulated :</span> {debug.accumulatedText ?? '—'}
            </p>
            <p>
              <span className="text-fg">apiCall :</span> {debug.apiCall ?? '—'}
            </p>
            <p>
              <span className="text-fg">lastResponse :</span> {debug.lastResponse ?? '—'}
            </p>
          </aside>
        )}
      </div>
    );
  },
);
UssdSimulator.displayName = 'UssdSimulator';
