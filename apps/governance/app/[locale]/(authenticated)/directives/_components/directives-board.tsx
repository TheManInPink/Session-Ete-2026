/**
 * @file        directives-board.tsx
 * @description GOV-02 — Tableau Kanban des directives, avec glisser-déposer
 *              (@dnd-kit). 5 colonnes : Brouillon → Envoyée → En cours →
 *              Terminée → Escaladée. Les cartes affichent émetteur/exécutant,
 *              échéance (rouge si en retard), priorité et niveau d'escalade.
 *
 *              Données 100 % mock. Le statut local Kanban suit la consigne
 *              (DRAFT/SENT/IN_PROGRESS/COMPLETED/ESCALATED) ; au branchement de
 *              governance-service il faudra mapper sur l'enum canonique
 *              `DirectiveStatus` (SENT≈PUBLISHED, COMPLETED≈CLOSED).
 *
 * @module      @nina-aes/governance
 */

'use client';

import { useState } from 'react';
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
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@nina-aes/ui/lib/utils';
import { CalendarClock, AlertTriangle, ArrowUpCircle, GripVertical } from 'lucide-react';

type DirectiveStatus = 'DRAFT' | 'SENT' | 'IN_PROGRESS' | 'COMPLETED' | 'ESCALATED';
type Priority = 'P1' | 'P2' | 'P3';

interface Directive {
  id: string;
  title: string;
  issuer: string;
  assignee: string;
  priority: Priority;
  deadline: string; // YYYY-MM-DD
  status: DirectiveStatus;
  escalationLevel: number; // 0 = local, 1+ = escalade hiérarchique
}

/** Colonnes du Kanban, dans l'ordre du cycle de vie. */
const COLUMNS: DirectiveStatus[] = ['DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'ESCALATED'];

/** Date de référence (mock déterministe) pour le calcul « en retard ». */
const TODAY = '2026-06-16';

const PRIORITY_STYLES: Record<Priority, string> = {
  P1: 'bg-danger-50 text-danger-700',
  P2: 'bg-warning-50 text-warning-700',
  P3: 'bg-bg-muted text-fg-muted',
};

const INITIAL_DIRECTIVES: Directive[] = [
  {
    id: 'd1',
    title: 'Harmonisation des bases NINA',
    issuer: 'Min. Intérieur — Mali',
    assignee: 'DNEC — Direction',
    priority: 'P1',
    deadline: '2026-06-30',
    status: 'IN_PROGRESS',
    escalationLevel: 0,
  },
  {
    id: 'd2',
    title: 'Déploiement passeport AES (phase 2)',
    issuer: 'BCID-AES',
    assignee: 'CTDEC — Bamako',
    priority: 'P2',
    deadline: '2026-07-15',
    status: 'IN_PROGRESS',
    escalationLevel: 0,
  },
  {
    id: 'd3',
    title: 'Budget Q2 — maintenance des centres',
    issuer: 'Min. Finances — Mali',
    assignee: 'DNEC — Direction',
    priority: 'P2',
    deadline: '2026-06-12',
    status: 'IN_PROGRESS',
    escalationLevel: 0,
  },
  {
    id: 'd4',
    title: 'Audit des centres Kayes–Sikasso',
    issuer: 'ASCE-LC',
    assignee: 'CTDEC — Régional',
    priority: 'P3',
    deadline: '2026-07-05',
    status: 'SENT',
    escalationLevel: 0,
  },
  {
    id: 'd5',
    title: "Accès à l'API de vérification AES",
    issuer: 'DGEC — Niger',
    assignee: 'DSI — Mali',
    priority: 'P2',
    deadline: '2026-06-20',
    status: 'SENT',
    escalationLevel: 0,
  },
  {
    id: 'd6',
    title: 'Formation des agents au canal USSD',
    issuer: 'DNEC — Direction',
    assignee: 'CTDEC — Tous centres',
    priority: 'P3',
    deadline: '2026-08-15',
    status: 'DRAFT',
    escalationLevel: 0,
  },
  {
    id: 'd7',
    title: 'Migration des certificats mTLS',
    issuer: 'BCID-AES',
    assignee: 'DSI — Mali',
    priority: 'P1',
    deadline: '2026-06-09',
    status: 'ESCALATED',
    escalationLevel: 2,
  },
  {
    id: 'd8',
    title: 'Rapport SIGAC trimestriel',
    issuer: 'OCLEI — Mali',
    assignee: 'CTDEC — Direction',
    priority: 'P3',
    deadline: '2026-05-31',
    status: 'COMPLETED',
    escalationLevel: 0,
  },
  {
    id: 'd9',
    title: 'Revue intégrité du fichier électoral',
    issuer: 'Min. Intérieur — Mali',
    assignee: 'DGE — Mali',
    priority: 'P1',
    deadline: '2026-06-25',
    status: 'DRAFT',
    escalationLevel: 0,
  },
];

const isOverdue = (d: Directive) =>
  new Date(d.deadline).getTime() < new Date(TODAY).getTime() && d.status !== 'COMPLETED';

export function DirectivesBoard({ locale }: { locale: string }) {
  const t = useTranslations('governance.directives');
  const [directives, setDirectives] = useState<Directive[]>(INITIAL_DIRECTIVES);

  // `distance: 5` : un simple clic ne déclenche pas de drag (évite les faux positifs).
  // KeyboardSensor : déplacement des cartes au clavier (accessibilité).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as DirectiveStatus;
    // Garde-fou : on ignore tout drop hors d'une colonne connue.
    if (!COLUMNS.includes(newStatus)) return;
    setDirectives((ds) =>
      ds.map((d) =>
        d.id === active.id && d.status !== newStatus ? { ...d, status: newStatus } : d,
      ),
    );
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="shrink-0 border-b border-warning/40 bg-warning-50 px-4 py-1.5 text-center text-xs text-warning-700">
        {t('demoBanner')}
      </div>

      <header className="shrink-0 px-6 pt-6">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-fg-muted">{t('subtitle')}</p>
      </header>

      {/* `id` stable : évite le mismatch d'hydratation des aria-describedby
          générés par @dnd-kit (DndDescribedBy-N) entre serveur et client. */}
      <DndContext
        id="directives-kanban"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-3 overflow-x-auto p-6">
          {COLUMNS.map((status) => {
            const cards = directives.filter((d) => d.status === status);
            return (
              <Column
                key={status}
                status={status}
                label={t(`columns.${status}`)}
                count={cards.length}
              >
                {cards.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-fg-muted">{t('empty')}</p>
                ) : (
                  cards.map((d) => <DirectiveCard key={d.id} directive={d} locale={locale} />)
                )}
              </Column>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: DirectiveStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      role="region"
      aria-label={`${label} (${count})`}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg border border-border bg-bg-muted/30 transition-colors',
        isOver && 'ring-2 ring-primary ring-offset-1',
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span
          className={cn(
            'text-sm font-semibold',
            status === 'ESCALATED' && 'text-danger-700',
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

function DirectiveCard({ directive, locale }: { directive: Directive; locale: string }) {
  const t = useTranslations('governance.directives');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: directive.id,
  });
  const overdue = isOverdue(directive);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const deadlineLabel = new Date(directive.deadline).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-grab touch-none rounded-base border bg-bg-card p-3 shadow-sm active:cursor-grabbing',
        overdue ? 'border-danger/40' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{directive.title}</p>
        <GripVertical className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </div>

      <p className="mt-1 text-xs text-fg-muted">
        {directive.issuer} → {directive.assignee}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            PRIORITY_STYLES[directive.priority],
          )}
        >
          {t(`priority.${directive.priority}`)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            overdue ? 'font-medium text-danger-700' : 'text-fg-muted',
          )}
        >
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {deadlineLabel}
        </span>
      </div>

      {(overdue || directive.escalationLevel > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {overdue && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-semibold text-danger-700">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {t('overdue')}
            </span>
          )}
          {directive.escalationLevel > 0 && (
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
