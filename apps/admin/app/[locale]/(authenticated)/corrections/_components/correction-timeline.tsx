/**
 * @file        correction-timeline.tsx
 * @description Timeline verticale des événements d'une demande de correction,
 *              limitée aux jalons réellement dérivables du backend
 *              (SUBMITTED → AI_SCORED → APPROVED | REJECTED, cf.
 *              lib/corrections/view-model.ts). Les anciens jalons fictifs
 *              (AGENT_REVIEW, DOCUMENT_REQUESTED, DOCUMENT_UPLOADED) n'avaient
 *              aucune colonne source : ils ont été retirés.
 *              Icônes + ligne verticale + dates localisées.
 *
 * @module      @nina-aes/admin
 */

import { useFormatter } from 'next-intl';
import { useTranslations } from 'next-intl';
import { Check, Send, Sparkles, X, type LucideIcon } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { AdminTimelineEvent } from '../../../../../lib/corrections/view-model';

const ICONS: Record<AdminTimelineEvent['kind'], LucideIcon> = {
  SUBMITTED: Send,
  AI_SCORED: Sparkles,
  APPROVED: Check,
  REJECTED: X,
};

const TONES: Record<AdminTimelineEvent['kind'], string> = {
  SUBMITTED: 'bg-bg-muted text-fg',
  AI_SCORED: 'bg-info-50 text-info-700',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-danger-50 text-danger-700',
};

const LABEL_KEYS: Record<AdminTimelineEvent['kind'], string> = {
  SUBMITTED: 'submitted',
  AI_SCORED: 'aiScored',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export function CorrectionTimeline({ events }: { events: AdminTimelineEvent[] }) {
  const t = useTranslations('admin.corrections.timeline');
  const format = useFormatter();

  return (
    <ol className="relative space-y-3 border-l-2 border-border pl-6" aria-label={t('label')}>
      {events.map((event, idx) => {
        const Icon = ICONS[event.kind];
        return (
          <li key={`${event.kind}-${idx}`} className="relative">
            {/* Pastille icône — chevauche la ligne verticale */}
            <span
              className={cn(
                'absolute -left-[34px] flex size-6 items-center justify-center rounded-full ring-4 ring-bg-card',
                TONES[event.kind],
              )}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <div className="text-sm">
              <p className="font-medium">
                {t(LABEL_KEYS[event.kind])}
                {event.actor && (
                  <span className="ml-1 font-normal text-fg-muted">· {event.actor}</span>
                )}
              </p>
              <p className="text-xs text-fg-muted">
                <time dateTime={event.at}>{format.dateTime(new Date(event.at), 'full')}</time>
                {event.note && <span className="ml-1 italic">— {event.note}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
