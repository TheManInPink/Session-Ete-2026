/**
 * @file        error-boundary.tsx
 * @description Frontière d'erreurs React (class component) capturant les exceptions
 *              de rendu de ses descendants et affichant un repli accessible
 *              (role="alert" / aria-live="polite"). Permet la réinitialisation.
 * @module      @nina-aes/ui
 */

'use client';

import { AlertOctagon, Home, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Button } from './button';

/** Props de la frontière d'erreurs. */
export interface ErrorBoundaryProps {
  /** Arbre React à protéger. */
  children: React.ReactNode;
  /**
   * Repli personnalisé. Reçoit l'erreur capturée, une fonction `reset`
   * pour réessayer le rendu, et l'éventuel identifiant de corrélation.
   */
  fallback?: (args: { error: Error; reset: () => void; correlationId?: string }) => React.ReactNode;
  /** Callback déclenché lors de la capture (journalisation, télémétrie…). */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /** Identifiant de corrélation propagé au repli (traçabilité des incidents). */
  correlationId?: string;
  /** Cible du lien « Retour à l'accueil » (par défaut `/`). */
  homeHref?: string;
}

/** État interne de la frontière d'erreurs. */
export interface ErrorBoundaryState {
  /** Erreur capturée, ou `null` si le rendu est sain. */
  error: Error | null;
}

/**
 * Frontière d'erreurs React.
 *
 * Un class component est requis ici : seuls `getDerivedStateFromError` et
 * `componentDidCatch` permettent d'intercepter les erreurs de rendu. Les hooks
 * ne sont donc volontairement pas utilisés (limitation attendue).
 *
 * @example
 *   <ErrorBoundary correlationId={traceId} onError={logError}>
 *     <App />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  /** Valeurs par défaut des props (homeHref). */
  static defaultProps: Partial<ErrorBoundaryProps> = {
    homeHref: '/',
  };

  state: ErrorBoundaryState = { error: null };

  /** Bascule l'état vers l'affichage du repli dès qu'une erreur est levée. */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  /** Notifie l'appelant de l'erreur capturée (effet de bord autorisé ici). */
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  /** Réinitialise l'état pour retenter le rendu des enfants. */
  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    const { children, fallback, correlationId, homeHref } = this.props;

    // Rendu sain : on rend simplement les enfants protégés.
    if (!error) {
      return children;
    }

    // Repli personnalisé prioritaire si fourni.
    if (fallback) {
      return fallback({ error, reset: this.reset, correlationId });
    }

    // Repli par défaut accessible.
    return (
      <DefaultErrorFallback
        error={error}
        reset={this.reset}
        correlationId={correlationId}
        homeHref={homeHref}
      />
    );
  }
}

/** Props du repli d'erreur par défaut. */
export interface DefaultErrorFallbackProps {
  /** Erreur capturée par la frontière. */
  error: Error;
  /** Réinitialise la frontière pour retenter le rendu. */
  reset: () => void;
  /** Identifiant de corrélation affiché pour le support. */
  correlationId?: string;
  /** Cible du lien « Retour à l'accueil » (par défaut `/`). */
  homeHref?: string;
}

/**
 * Repli d'erreur par défaut : message centré, lisible et accessible, avec
 * actions de récupération (recharger / retour à l'accueil).
 */
export function DefaultErrorFallback({
  error,
  reset,
  correlationId,
  homeHref = '/',
}: DefaultErrorFallbackProps): React.ReactElement {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-4 p-8 text-center')}
    >
      <AlertOctagon className="size-24 text-destructive" aria-hidden="true" />

      <h2 className="text-2xl font-bold font-display text-fg">Une erreur est survenue</h2>

      <p className="max-w-md text-sm text-fg-muted">
        {error.message ||
          "Quelque chose s'est mal passé. Vous pouvez réessayer ou revenir à l'accueil."}
      </p>

      {correlationId ? (
        <div className="rounded-base bg-bg-muted px-2 py-1 font-mono text-xs text-fg-muted">
          ID de corrélation&nbsp;: {correlationId}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Bouton principal : retente le rendu. autoFocus pour le clavier. */}
        <Button type="button" variant="solid" onClick={reset} autoFocus>
          <RefreshCw aria-hidden="true" />
          Recharger
        </Button>

        {/* Lien de secours vers l'accueil, rendu comme un bouton fantôme. */}
        <Button variant="ghost" asChild>
          <a href={homeHref}>
            <Home aria-hidden="true" />
            {"Retour à l'accueil"}
          </a>
        </Button>
      </div>
    </div>
  );
}
DefaultErrorFallback.displayName = 'DefaultErrorFallback';
