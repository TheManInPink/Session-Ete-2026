/**
 * @file        correction-drawer.tsx
 * @description Drawer right (Sheet @nina-aes/ui) qui affiche le détail d'une
 *              correction sélectionnée dans le DataGrid, avec actions
 *              d'approbation / rejet (mock pour Session 3).
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@nina-aes/ui/components/sheet';
import { Button } from '@nina-aes/ui/components/button';
import { Label } from '@nina-aes/ui/components/label';
import { Card, CardContent } from '@nina-aes/ui/components/card';
import { ArrowRight, Check, FileText, Loader2, X } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { AdminCorrection } from '../../../../../lib/mock-corrections';
import { AiScorePanel } from './ai-score-panel';
import { CorrectionTimeline } from './correction-timeline';
import { StatusBadge } from './status-badge';

interface Props {
  correction: AdminCorrection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecision: (id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) => void;
}

export function CorrectionDrawer({ correction, open, onOpenChange, onDecision }: Props) {
  const t = useTranslations('admin.corrections');
  const tField = useTranslations('admin.corrections.field');
  const tCommon = useTranslations('common');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isPending, startTransition] = useTransition();

  // Reset l'état local quand la correction change
  if (!correction) return null;

  const handleApprove = () => {
    startTransition(() => {
      onDecision(correction.id, 'APPROVED');
      onOpenChange(false);
    });
  };

  const handleRejectSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (rejectReason.trim().length < 5) return;
    startTransition(() => {
      onDecision(correction.id, 'REJECTED', rejectReason);
      setRejectMode(false);
      setRejectReason('');
      onOpenChange(false);
    });
  };

  const closeWithReset = (next: boolean) => {
    if (!next) {
      setRejectMode(false);
      setRejectReason('');
    }
    onOpenChange(next);
  };

  const decided = correction.status === 'APPROVED' || correction.status === 'REJECTED';

  return (
    <Sheet open={open} onOpenChange={closeWithReset}>
      <SheetContent side="right" className="flex flex-col p-0">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle>{t('drawer.title', { id: correction.id })}</SheetTitle>
            <StatusBadge status={correction.status} />
          </div>
          {/* Description sr-only — exigée par Radix Dialog pour l'accessibilité
              (`aria-describedby` auto-câblé). Visible pour les lecteurs d'écran
              uniquement, fournit le contexte de la modale. */}
          <SheetDescription className="sr-only">
            {t('drawer.fieldChange')} · {tField(correction.field)} — {correction.citizenName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Citoyen */}
          <section>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t('drawer.citizen')}
            </p>
            <p className="mt-1 font-medium">{correction.citizenName}</p>
            <p className="font-mono text-xs text-fg-muted">{correction.nina}</p>
          </section>

          {/* Modification du champ */}
          <section>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t('drawer.fieldChange')} · {tField(correction.field)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Card className="flex-1">
                <CardContent className="break-words p-3 text-sm font-mono line-through text-fg-muted">
                  {correction.currentValue}
                </CardContent>
              </Card>
              <ArrowRight className="size-4 text-fg-muted" aria-hidden="true" />
              <Card className="flex-1 border-primary/40 bg-primary-50/40">
                <CardContent className="break-words p-3 text-sm font-mono">
                  {correction.proposedValue}
                </CardContent>
              </Card>
            </div>
            <p className="mt-2 text-sm italic text-fg-muted">« {correction.reason} »</p>
          </section>

          {/* Score IA */}
          <AiScorePanel
            score={correction.aiScore}
            verdict={correction.aiVerdict}
            subScores={correction.aiSubScores}
          />

          {/* Justificatif */}
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t('drawer.justificatif')}
            </p>
            {correction.hasJustificatif ? (
              <Card>
                <CardContent className="flex items-center gap-3 p-3 text-sm">
                  <FileText className="size-5 text-info-500" aria-hidden="true" />
                  <span>
                    acte_naissance_{correction.id}.pdf
                    <span className="ml-2 text-xs text-fg-muted">PDF · 1.4 Mo</span>
                  </span>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-fg-muted">{t('drawer.noJustificatif')}</p>
            )}
          </section>

          {/* Timeline */}
          <section>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t('drawer.timelineTitle')}
            </p>
            <CorrectionTimeline events={correction.timeline} />
          </section>
        </div>

        {/* Footer actions */}
        {!decided && (
          <SheetFooter
            className={cn('sticky bottom-0 bg-bg-card', rejectMode && 'flex-col items-stretch')}
          >
            {rejectMode ? (
              <form onSubmit={handleRejectSubmit} className="w-full space-y-3">
                <div>
                  <Label htmlFor="reject-reason">{t('drawer.rejectReason')}</Label>
                  <textarea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('drawer.rejectReasonPlaceholder')}
                    rows={3}
                    minLength={5}
                    required
                    className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setRejectMode(false)}
                    disabled={isPending}
                  >
                    {tCommon('cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={isPending || rejectReason.trim().length < 5}
                  >
                    {isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <X className="size-4" aria-hidden="true" />
                    )}
                    {t('drawer.reject')}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setRejectMode(true)}
                  disabled={isPending}
                >
                  <X className="size-4" aria-hidden="true" />
                  {t('drawer.reject')}
                </Button>
                <Button type="button" onClick={handleApprove} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                  {t('drawer.approve')}
                </Button>
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
