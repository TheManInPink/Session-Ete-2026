/**
 * @file        correction-drawer.tsx
 * @description Drawer right (Sheet @nina-aes/ui) qui affiche le détail d'une
 *              correction sélectionnée dans le DataGrid (modèle de vue
 *              `AdminCorrectionView` dérivé du contrat @nina-aes/api-client),
 *              avec actions d'approbation / rejet branchées sur les mutations
 *              du parent (`useApproveCorrection` / `useRejectCorrection`).
 *
 *              Le motif de rejet est obligatoire et fait AU MOINS 20 caractères
 *              (contrainte `RejectCorrectionDto` du backend — le formulaire la
 *              reflète côté client pour éviter un aller-retour 400).
 *
 *              En cas d'échec de la mutation, le drawer reste ouvert et l'état
 *              affiché reste celui du serveur (aucune mise à jour optimiste →
 *              rien à annuler) ; le parent affiche le toast d'erreur.
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useState, type SyntheticEvent } from 'react';
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
import type { AdminCorrectionView } from '../../../../../lib/corrections/view-model';
import { AiScorePanel } from './ai-score-panel';
import { CorrectionTimeline } from './correction-timeline';
import { StatusBadge } from './status-badge';

/** Longueur minimale du motif de rejet (contrat backend `RejectCorrectionDto`). */
const REJECT_REASON_MIN = 20;

/**
 * N'autorise au rendu (href cliquable) que les URL http/https. Neutralise les
 * schémas exécutables (`javascript:`) ou porteurs de charge utile (`data:`) —
 * React ne les assainit PAS. Défense au rendu, en complément du refus déjà posé
 * au contrat Zod (`SafeDocUrlSchema`). Retourne false sur URL invalide.
 */
function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

interface Props {
  correction: AdminCorrectionView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Approuve la demande ; résout `true` si la mutation a réussi. */
  onApprove: (id: string) => Promise<boolean>;
  /** Rejette la demande (motif ≥ 20 car.) ; résout `true` si succès. */
  onReject: (id: string, reason: string) => Promise<boolean>;
  /** Vrai pendant qu'une mutation approve/reject est en vol. */
  isDeciding: boolean;
}

export function CorrectionDrawer({
  correction,
  open,
  onOpenChange,
  onApprove,
  onReject,
  isDeciding,
}: Props) {
  const t = useTranslations('admin.corrections');
  const tField = useTranslations('admin.corrections.field');
  const tCommon = useTranslations('common');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (!correction) return null;

  const resetLocalState = () => {
    setRejectMode(false);
    setRejectReason('');
  };

  const handleApprove = async () => {
    const ok = await onApprove(correction.id);
    // Échec ⇒ drawer ouvert, état serveur inchangé (le parent notifie l'erreur).
    if (ok) {
      resetLocalState();
      onOpenChange(false);
    }
  };

  const handleRejectSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const reason = rejectReason.trim();
    if (reason.length < REJECT_REASON_MIN) return;
    const ok = await onReject(correction.id, reason);
    if (ok) {
      resetLocalState();
      onOpenChange(false);
    }
  };

  const closeWithReset = (next: boolean) => {
    if (!next) resetLocalState();
    onOpenChange(next);
  };

  // Seul l'état UNDER_REVIEW est décidable (invariant backend).
  const decidable = correction.status === 'UNDER_REVIEW';
  // Le motif est invalide seulement après saisie (évite une erreur au champ vide initial).
  const reasonTooShort = rejectReason.length > 0 && rejectReason.trim().length < REJECT_REASON_MIN;

  return (
    <Sheet open={open} onOpenChange={closeWithReset}>
      {/* Hauteur viewport EXPLICITE (`h-dvh`) + `overflow-hidden` : borne la
          colonne flex à la hauteur du drawer pour que le contenu long ne
          déborde jamais sous le footer d'actions — c'est le `min-h-0` du corps
          qui absorbe le scroll. (`h-dvh` lève toute ambiguïté de résolution de
          `height:100%` sur un contenu porté par un portail.) */}
      <SheetContent side="right" className="flex h-dvh flex-col overflow-hidden p-0">
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

        {/* `min-h-0` : sans lui, cet enfant flex garde `min-height:auto` et ne
            rétrécit pas sous la hauteur de son contenu — l'`overflow-y-auto` ne
            s'activerait pas et le footer (Approuver/Rejeter) serait poussé sous
            le viewport, donc inatteignable sur un écran court. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-5">
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
            {correction.reason && (
              <p className="mt-2 text-sm italic text-fg-muted">« {correction.reason} »</p>
            )}
          </section>

          {/* Score IA (score global uniquement — pas de sous-scores backend) */}
          <AiScorePanel score={correction.aiScore} verdict={correction.aiVerdict} />

          {/* Justificatif — lien réel (URL signée) ou état « aucun » honnête */}
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
              {t('drawer.justificatif')}
            </p>
            {correction.justificationDocUrl && isHttpUrl(correction.justificationDocUrl) ? (
              <Card>
                <CardContent className="flex items-center gap-3 p-3 text-sm">
                  <FileText className="size-5 shrink-0 text-info-500" aria-hidden="true" />
                  <a
                    href={correction.justificationDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-primary"
                  >
                    {t('drawer.viewJustificatif')}
                  </a>
                </CardContent>
              </Card>
            ) : correction.justificationDocUrl ? (
              // URL présente mais schéma non affichable (ni http ni https) : on
              // NE rend PAS de lien exécutable — état neutre, non cliquable.
              <p className="text-sm text-fg-muted">{t('drawer.justificatifUnavailable')}</p>
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

        {/* Footer actions — uniquement quand la demande est décidable */}
        {decidable && (
          <SheetFooter
            className={cn('sticky bottom-0 bg-bg-card', rejectMode && 'flex-col items-stretch')}
          >
            {rejectMode ? (
              <form
                onSubmit={handleRejectSubmit}
                className="w-full space-y-3"
                aria-busy={isDeciding}
              >
                <div>
                  <Label htmlFor="reject-reason">{t('drawer.rejectReason')}</Label>
                  <textarea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('drawer.rejectReasonPlaceholder')}
                    rows={3}
                    minLength={REJECT_REASON_MIN}
                    required
                    disabled={isDeciding}
                    aria-invalid={reasonTooShort}
                    aria-describedby={reasonTooShort ? 'reject-reason-error' : undefined}
                    className={cn(
                      'mt-1 flex w-full rounded-base border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      reasonTooShort ? 'border-danger' : 'border-border',
                    )}
                  />
                  {reasonTooShort && (
                    <p
                      id="reject-reason-error"
                      role="alert"
                      className="mt-1 text-xs text-danger-700"
                    >
                      {/* Contrainte backend `RejectCorrectionDto` (min 20). */}
                      {t('drawer.rejectReasonError', { min: REJECT_REASON_MIN })}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setRejectMode(false)}
                    disabled={isDeciding}
                  >
                    {tCommon('cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={isDeciding || rejectReason.trim().length < REJECT_REASON_MIN}
                  >
                    {isDeciding ? (
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
                  disabled={isDeciding}
                >
                  <X className="size-4" aria-hidden="true" />
                  {t('drawer.reject')}
                </Button>
                <Button type="button" onClick={handleApprove} disabled={isDeciding}>
                  {isDeciding ? (
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
