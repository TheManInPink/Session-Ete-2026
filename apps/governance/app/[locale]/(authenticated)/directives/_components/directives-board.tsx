/**
 * @file        directives-board.tsx
 * @description GOV-02 — Tableau Kanban des directives branché sur
 *              `@nina-aes/api-client` (pattern citizen, ADR-031), avec
 *              glisser-déposer (@dnd-kit). Les 5 colonnes sont les statuts
 *              SERVEUR (`DirectiveStatus`) : Brouillon → Envoyée → En cours →
 *              Terminée · Rejetée. L'escalade n'est PAS une colonne : c'est un
 *              badge `escalationLevel > 0` (bordure d'alerte) sur la carte.
 *
 *              Le drag-and-drop ne propose que les transitions LÉGALES de la
 *              machine à états serveur (`isDirectiveTransitionAllowed`) ; la
 *              mutation `useTransitionDirective` est appliquée en optimiste
 *              (la carte bouge immédiatement) avec ROLLBACK si le serveur — ou
 *              le mock, même machine à états — refuse. Une transition vers
 *              REJECTED exige une note (contrainte `TransitionDirectiveDto`).
 *
 * @module      @nina-aes/governance
 */

'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  isDirectiveTransitionAllowed,
  type DirectiveStatus,
  type DirectiveView,
  type SgogtPriority,
} from '@nina-aes/api-client';
import { useApiMode, useDirectives, useTransitionDirective } from '@nina-aes/api-client/react';
import { Button } from '@nina-aes/ui/components/button';
import { cn } from '@nina-aes/ui/lib/utils';
import { CalendarClock, AlertTriangle, ArrowUpCircle, GripVertical } from 'lucide-react';
import { resolveOfficial } from '../../../../../lib/directory';

/** Colonnes du Kanban = statuts serveur, dans l'ordre du cycle de vie. */
const COLUMNS: DirectiveStatus[] = ['DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];

/** Priorité d'affichage du design system (P1..P3) pour une priorité serveur. */
type ViewPriority = 'P1' | 'P2' | 'P3';

/** Mapping serveur → affichage : CRITICAL→P1, HIGH→P2, NORMAL→P3. */
const PRIORITY_VIEW: Record<SgogtPriority, ViewPriority> = {
  CRITICAL: 'P1',
  HIGH: 'P2',
  NORMAL: 'P3',
};

const PRIORITY_STYLES: Record<ViewPriority, string> = {
  P1: 'bg-danger-50 text-danger-700',
  P2: 'bg-warning-50 text-warning-700',
  P3: 'bg-bg-muted text-fg-muted',
};

/** Statuts terminaux : l'échéance dépassée n'y est plus une alerte. */
const TERMINAL_STATUSES: readonly DirectiveStatus[] = ['COMPLETED', 'REJECTED'];

/** Vrai si la directive a dépassé son échéance sans être clôturée. */
function isOverdue(d: DirectiveView, nowMs: number): boolean {
  return (
    d.deadline !== null && Date.parse(d.deadline) < nowMs && !TERMINAL_STATUSES.includes(d.status)
  );
}

export function DirectivesBoard({ locale }: { locale: string }) {
  const t = useTranslations('governance.directives');
  const apiMode = useApiMode();
  const directivesQuery = useDirectives();
  const transitionMutation = useTransitionDirective();

  // Référence temporelle stable pour le calcul « en retard » (posée une fois
  // au montage — évite un recalcul par render sans enjeu de fraîcheur).
  const [nowMs] = useState(() => Date.now());

  // ── Optimisme : override `from → to` par directive pendant la mutation ────
  // La carte bouge immédiatement. L'override n'est appliqué que tant que le
  // serveur affiche encore `from` : dès que le refetch confirme la transition
  // (statut ≠ `from`), il devient INERTE de lui-même — aucun effet de nettoyage
  // n'est nécessaire (la machine à états est sans cycle, `from` ne peut pas
  // réapparaître). En cas de refus serveur, ROLLBACK : l'entrée est retirée.
  const [overrides, setOverrides] = useState<
    Record<string, { from: DirectiveStatus; to: DirectiveStatus }>
  >({});
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const directives = useMemo(() => {
    const base = directivesQuery.data ?? [];
    return base.map((d) => {
      const override = overrides[d.id];
      return override !== undefined && d.status === override.from
        ? { ...d, status: override.to }
        : d;
    });
  }, [directivesQuery.data, overrides]);

  /** Applique une transition (optimiste + rollback sur refus serveur). */
  const applyTransition = (directive: DirectiveView, toStatus: DirectiveStatus, note?: string) => {
    setTransitionError(null);
    // `from` = statut CONNU DU SERVEUR (cache) : l'override reste actif pendant
    // toute la fenêtre mutation + refetch, même en cas de drags rapprochés.
    const serverStatus =
      directivesQuery.data?.find((d) => d.id === directive.id)?.status ?? directive.status;
    setOverrides((o) => ({ ...o, [directive.id]: { from: serverStatus, to: toStatus } }));
    transitionMutation.mutate(
      { id: directive.id, toStatus, ...(note !== undefined ? { note } : {}) },
      {
        onError: () => {
          // ROLLBACK : on retire l'override, la carte revient à l'état serveur.
          setOverrides((o) => {
            const next = { ...o };
            delete next[directive.id];
            return next;
          });
          setTransitionError(t('transitionError'));
        },
      },
    );
  };

  // ── Rejet : note obligatoire (dialogue de saisie) ─────────────────────────
  const [rejectTarget, setRejectTarget] = useState<DirectiveView | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const confirmReject = () => {
    if (!rejectTarget || rejectNote.trim().length === 0) return;
    applyTransition(rejectTarget, 'REJECTED', rejectNote.trim());
    setRejectTarget(null);
    setRejectNote('');
  };

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  // `distance: 5` : un simple clic ne déclenche pas de drag (évite les faux positifs).
  // KeyboardSensor : déplacement des cartes au clavier (accessibilité).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Statut de la carte en cours de drag → grise les colonnes illégales.
  const [activeStatus, setActiveStatus] = useState<DirectiveStatus | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const dragged = directives.find((d) => d.id === event.active.id);
    setActiveStatus(dragged?.status ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveStatus(null);
    const { active, over } = event;
    if (!over) return;
    const toStatus = over.id as DirectiveStatus;
    // Garde-fou : on ignore tout drop hors d'une colonne connue.
    if (!COLUMNS.includes(toStatus)) return;
    const directive = directives.find((d) => d.id === active.id);
    if (!directive || directive.status === toStatus) return;
    // Seules les transitions légales de la machine à états sont émises.
    if (!isDirectiveTransitionAllowed(directive.status, toStatus)) return;
    if (toStatus === 'REJECTED') {
      // La note est obligatoire pour un rejet : on ouvre le dialogue de saisie.
      setRejectTarget(directive);
      return;
    }
    applyTransition(directive, toStatus);
  };

  return (
    <div className="flex h-screen flex-col">
      {apiMode === 'mock' && (
        <div className="shrink-0 border-b border-warning/40 bg-warning-50 px-4 py-1.5 text-center text-xs text-warning-700">
          {t('demoBanner')}
        </div>
      )}

      <header className="shrink-0 px-6 pt-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
        {transitionError && (
          <p className="mt-2 text-sm text-danger-700" role="alert">
            {transitionError}
          </p>
        )}
      </header>

      {directivesQuery.isPending ? (
        <p className="p-6 text-sm text-fg-muted">{t('loading')}</p>
      ) : directivesQuery.isError ? (
        <p className="p-6 text-sm text-danger-700">{t('loadError')}</p>
      ) : (
        /* `id` stable : évite le mismatch d'hydratation des aria-describedby
           générés par @dnd-kit (DndDescribedBy-N) entre serveur et client. */
        <DndContext
          id="directives-kanban"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragCancel={() => setActiveStatus(null)}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto p-6">
            {COLUMNS.map((status) => {
              const cards = directives.filter((d) => d.status === status);
              const legalTarget =
                activeStatus === null ||
                activeStatus === status ||
                isDirectiveTransitionAllowed(activeStatus, status);
              return (
                <Column
                  key={status}
                  status={status}
                  label={t(`columns.${status}`)}
                  count={cards.length}
                  legalTarget={legalTarget}
                >
                  {cards.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-fg-muted">{t('empty')}</p>
                  ) : (
                    cards.map((d) => (
                      <DirectiveCard key={d.id} directive={d} locale={locale} nowMs={nowMs} />
                    ))
                  )}
                </Column>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* ── Dialogue de rejet (note obligatoire — TransitionDirectiveDto) ── */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('reject.title')}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-bg-card p-4 shadow-lg">
            <h2 className="text-lg font-semibold">{t('reject.title')}</h2>
            <p className="mt-1 text-sm text-fg-muted">{rejectTarget.title}</p>
            <label htmlFor="reject-note" className="mt-3 block text-sm font-medium">
              {t('reject.label')}
            </label>
            <textarea
              id="reject-note"
              rows={4}
              maxLength={2000}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder={t('reject.placeholder')}
              className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectNote('');
                }}
              >
                {t('reject.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={rejectNote.trim().length === 0}
                onClick={confirmReject}
              >
                {t('reject.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Column({
  status,
  label,
  count,
  legalTarget,
  children,
}: {
  status: DirectiveStatus;
  label: string;
  count: number;
  /** Faux si la carte en cours de drag ne peut pas légalement y être déposée. */
  legalTarget: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !legalTarget });
  return (
    <section
      ref={setNodeRef}
      role="region"
      aria-label={`${label} (${count})`}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg border border-border bg-bg-muted/30 transition-colors',
        isOver && 'ring-2 ring-primary ring-offset-1',
        !legalTarget && 'opacity-40',
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span
          className={cn(
            'text-sm font-semibold',
            status === 'REJECTED' && 'text-danger-700',
            status === 'COMPLETED' && 'text-success-700',
          )}
        >
          {label}
        </span>
        <span className="rounded-full bg-bg-card px-2 py-0.5 text-xs text-fg-muted">{count}</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

function DirectiveCard({
  directive,
  locale,
  nowMs,
}: {
  directive: DirectiveView;
  locale: string;
  nowMs: number;
}) {
  const t = useTranslations('governance.directives');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: directive.id,
  });
  const overdue = isOverdue(directive, nowMs);
  const escalated = directive.escalationLevel > 0;
  const viewPriority = PRIORITY_VIEW[directive.priority];

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const deadlineLabel = directive.deadline
    ? new Date(directive.deadline).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-grab touch-none rounded-base border bg-bg-card p-3 shadow-sm active:cursor-grabbing',
        // Bordure d'alerte : échéance dépassée OU directive escaladée.
        overdue || escalated ? 'border-danger/40' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{directive.title}</p>
        <GripVertical className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </div>

      <p className="mt-1 text-xs text-fg-muted">
        {resolveOfficial(directive.createdById).name} →{' '}
        {directive.assigneeId ? resolveOfficial(directive.assigneeId).name : t('unassigned')}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            PRIORITY_STYLES[viewPriority],
          )}
        >
          {t(`priority.${viewPriority}`)}
        </span>
        {deadlineLabel && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs',
              overdue ? 'font-medium text-danger-700' : 'text-fg-muted',
            )}
          >
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {deadlineLabel}
          </span>
        )}
      </div>

      {(overdue || escalated) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {overdue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {t('overdue')}
            </span>
          )}
          {escalated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700">
              <ArrowUpCircle className="size-3" aria-hidden="true" />
              {t('escalation', { level: directive.escalationLevel })}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
