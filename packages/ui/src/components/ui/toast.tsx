/**
 * @file        toast.tsx
 * @description Système de toasts NINA-AES sans dépendance externe — contexte +
 *              file + portail + hook `useToast`. Chaque notification adopte le
 *              couple `role`/`aria-live` adapté à sa sévérité (status/polite pour
 *              info/success, alert/assertive pour warning/danger) afin d'être
 *              annoncée correctement par les lecteurs d'écran.
 * @module      @nina-aes/ui
 */

'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';
import { Button } from './button';

/** Sévérités sémantiques d'un toast. */
export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

/** Action optionnelle rendue dans le toast (bouton secondaire). */
export interface ToastAction {
  /** Libellé du bouton d'action. */
  label: string;
  /** Gestionnaire déclenché au clic sur l'action. */
  onClick: () => void;
}

/** Options acceptées par `toast(opts)`. */
export interface ToastOptions {
  /** Titre court (gras). */
  title?: string;
  /** Description complémentaire. */
  description?: string;
  /** Sévérité — pilote l'icône, la couleur et les attributs ARIA. */
  variant?: ToastVariant;
  /** Durée d'affichage en ms avant fermeture auto ; `0` = persistant. */
  duration?: number;
  /** Action optionnelle (bouton). */
  action?: ToastAction;
}

/** Toast effectivement stocké dans la file (options + identifiant attribué). */
export interface Toast extends ToastOptions {
  /** Identifiant unique attribué à la création. */
  id: string;
}

/** API exposée par le hook `useToast`. */
export interface ToastContextValue {
  /** Empile un nouveau toast et renvoie son identifiant. */
  toast: (opts: ToastOptions) => string;
  /** Ferme un toast par son id (ou tous les toasts si `id` est omis). */
  dismiss: (id?: string) => void;
}

/**
 * Contexte du système de toasts. Vaut `null` hors d'un `ToastProvider`, ce qui
 * permet à `useToast` de lever une erreur explicite en cas d'usage incorrect.
 */
const ToastContext = React.createContext<ToastContextValue | null>(null);

/** Durée d'auto-fermeture par défaut (ms). */
const DEFAULT_DURATION = 5000;

/** Icône Lucide associée à chaque sévérité. */
const iconByVariant = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
} as const;

/** Couleur de l'icône selon la sévérité (jetons sémantiques). */
const iconColorByVariant: Record<ToastVariant, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

/** Sévérités considérées comme interruptives (annonce assertive). */
const ASSERTIVE_VARIANTS: ReadonlySet<ToastVariant> = new Set(['warning', 'danger']);

/**
 * Abonnement « no-op » pour `useSyncExternalStore` : aucun changement de source
 * externe n'est attendu, on s'en sert uniquement pour différencier serveur
 * (snapshot `false`) et client (snapshot `true`).
 */
const subscribeNoop = (): (() => void) => () => {};

/**
 * Fournisseur racine du système de toasts. Détient la file de notifications et
 * rend le viewport via `createPortal` sur `document.body` (côté client
 * uniquement). À placer une fois, haut dans l'arbre applicatif.
 *
 * @example
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  // Compteur incrémental pour des identifiants stables (jamais Math.random).
  const counterRef = React.useRef(0);
  // Map des timers d'auto-fermeture, indexés par id, pour nettoyage ciblé.
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Annule et oublie le timer associé à un id, s'il existe. */
  const clearTimer = React.useCallback((id: string) => {
    const timers = timersRef.current;
    const handle = timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.delete(id);
    }
  }, []);

  /** Ferme un toast (ou tous si `id` omis) et nettoie ses timers. */
  const dismiss = React.useCallback(
    (id?: string) => {
      if (id === undefined) {
        timersRef.current.forEach((handle) => clearTimeout(handle));
        timersRef.current.clear();
        setToasts([]);
        return;
      }
      clearTimer(id);
      setToasts((current) => current.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  /** Empile un toast, programme son auto-fermeture, renvoie son id. */
  const toast = React.useCallback((opts: ToastOptions) => {
    counterRef.current += 1;
    const id = `toast-${counterRef.current}`;
    const duration = opts.duration ?? DEFAULT_DURATION;
    const next: Toast = { ...opts, id, variant: opts.variant ?? 'info', duration };

    setToasts((current) => [...current, next]);

    // `0` = persistant : aucune fermeture automatique.
    if (duration > 0) {
      const handle = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((current) => current.filter((t) => t.id !== id));
      }, duration);
      timersRef.current.set(id, handle);
    }

    return id;
  }, []);

  // Nettoyage de tous les timers en attente au démontage du provider.
  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((handle) => clearTimeout(handle));
      timers.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
ToastProvider.displayName = 'ToastProvider';

/**
 * Hook d'accès à l'API toasts. Doit être appelé sous un `ToastProvider`.
 *
 * @throws {Error} Si utilisé en dehors d'un `ToastProvider`.
 * @example
 *   const { toast, dismiss } = useToast();
 *   toast({ title: 'Enregistré', variant: 'success' });
 */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast doit être utilisé à l’intérieur d’un <ToastProvider>.');
  }
  return context;
}

/**
 * Viewport rendu en portail sur `document.body`. Conteneur fixe en bas à droite,
 * empilant les toasts (le plus récent en bas via `flex-col-reverse`). Rendu
 * uniquement côté client pour rester compatible SSR.
 */
function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  // `createPortal` requiert `document` : on dérive l'état « monté côté client »
  // via `useSyncExternalStore` (snapshot serveur = false) plutôt qu'un
  // `setState` dans un effet, qui déclencherait des rendus en cascade.
  const mounted = React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-sm"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}
ToastViewport.displayName = 'ToastViewport';

/**
 * Carte d'un toast individuel : icône sémantique, titre, description, action
 * optionnelle et bouton de fermeture. Animation d'entrée par translation +
 * opacité, déclenchée après le premier rendu.
 */
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const variant = toast.variant ?? 'info';
  const Icon = iconByVariant[variant];
  const assertive = ASSERTIVE_VARIANTS.has(variant);

  const titleId = React.useId();
  const descriptionId = React.useId();

  // Pilote l'animation d'entrée : monte « hors écran » puis glisse en place.
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-labelledby={toast.title ? titleId : undefined}
      aria-describedby={toast.description ? descriptionId : undefined}
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-base border border-border bg-bg-card p-4 shadow-lg',
        'transition duration-300 ease-out',
        visible ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
      )}
    >
      <Icon
        className={cn('mt-0.5 size-5 shrink-0', iconColorByVariant[variant])}
        aria-hidden="true"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {toast.title ? (
          <p id={titleId} className="font-medium text-fg">
            {toast.title}
          </p>
        ) : null}
        {toast.description ? (
          <p id={descriptionId} className="text-sm text-fg-muted">
            {toast.description}
          </p>
        ) : null}
        {toast.action ? (
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </Button>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Fermer"
        onClick={() => onDismiss(toast.id)}
        className={cn(
          'shrink-0 rounded-sm p-0.5 text-fg-muted transition-colors hover:text-fg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        )}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
ToastItem.displayName = 'ToastItem';
