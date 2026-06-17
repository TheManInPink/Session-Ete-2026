/**
 * @file        correction-wizard.tsx
 * @description Wizard 4 étapes : champ → nouvelle valeur → justificatif → confirmation.
 *
 *              États gérés en mémoire (useState) plutôt qu'en URL pour éviter de
 *              divulguer le NINA dans l'historique de navigation. La soumission
 *              finale appelle `clientApi.correction.submit()` via TanStack Query.
 *
 *              **Mode démo** : si aucune API n'est joignable, on simule un succès
 *              et on redirige vers `/dashboard` avec un message toast simulé.
 *              L'étape 3 (justificatif) valide le fichier localement mais ne
 *              l'envoie pas (document-service non connecté, cf. doc 10).
 * @module      @nina-aes/citizen
 */

'use client';

import { useState, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@nina-aes/ui/components/button';
import { Input } from '@nina-aes/ui/components/input';
import { Label } from '@nina-aes/ui/components/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  AlertCircle,
  UploadCloud,
  FileText,
  X,
} from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { CorrectionField } from '@nina-aes/api-client';
import { useSubmitCorrection } from '@nina-aes/api-client/react';

interface WizardProps {
  nina: string;
  locale: string;
}

/** Champs autorisés à la correction côté citoyen (la liste serveur fait foi). */
const CORRECTABLE_FIELDS: CorrectionField[] = [
  'firstName',
  'lastName',
  'birthDate',
  'birthPlace',
  'residence_cercle',
  'residence_commune',
  'fatherName',
  'motherName',
  'profession',
];

/** Types MIME acceptés pour un justificatif + taille maximale (5 Mo). */
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE = 5 * 1024 * 1024;

interface WizardState {
  step: 1 | 2 | 3 | 4;
  field: CorrectionField | null;
  proposedValue: string;
  reason: string;
  justificationDocUrl: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  field: null,
  proposedValue: '',
  reason: '',
  justificationDocUrl: null,
};

export function CorrectionWizard({ nina, locale }: WizardProps) {
  const t = useTranslations('correction');
  const router = useRouter();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const submitCorrection = useSubmitCorrection();
  const isSubmitting = submitCorrection.isPending;

  // ── Justificatif (étape 3) — upload mock : validé localement, jamais envoyé ─
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const setField = (field: CorrectionField) => setState((s) => ({ ...s, field }));
  const next = () =>
    setState((s) => ({ ...s, step: Math.min(4, s.step + 1) as WizardState['step'] }));
  const prev = () =>
    setState((s) => ({ ...s, step: Math.max(1, s.step - 1) as WizardState['step'] }));

  /** Valide puis « accepte » localement un fichier (aucun appel réseau). */
  const handleFiles = (list: FileList | null) => {
    setUploadError(null);
    const f = list?.[0];
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setUploadError(t('steps.3.errorFormat'));
      return;
    }
    if (f.size > MAX_SIZE) {
      setUploadError(t('steps.3.errorSize'));
      return;
    }
    setFile(f);
    setState((s) => ({ ...s, justificationDocUrl: `mock://${f.name}` }));
  };

  /** Retire le justificatif sélectionné. */
  const clearFile = () => {
    setFile(null);
    setUploadError(null);
    setState((s) => ({ ...s, justificationDocUrl: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Formate une taille d'octets en Ko/Mo lisible. */
  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
      : `${Math.max(1, Math.round(bytes / 1024))} Ko`;

  const canContinue =
    (state.step === 1 && state.field !== null) ||
    (state.step === 2 &&
      state.proposedValue.trim().length > 0 &&
      state.reason.trim().length >= 10) ||
    state.step === 3 ||
    state.step === 4;

  /** Soumet la correction au backend (mock → fixture, live → gateway via BFF). */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const field = state.field;
    if (!field) return;
    setError(null);
    try {
      // Le justificatif n'est pas encore transmis (document-service, cf. doc 10) :
      // on n'envoie donc pas `justificationDocUrl` tant que l'upload n'est pas câblé.
      await submitCorrection.mutateAsync({
        nina,
        field,
        proposedValue: state.proposedValue.trim(),
        reason: state.reason.trim(),
      });
      router.push(`/${locale}/dashboard?submitted=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('summary.error'));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Stepper visuel */}
      <ol className="mb-8 flex items-center justify-between" aria-label={t('steps.ariaLabel')}>
        {[1, 2, 3, 4].map((step) => (
          <li
            key={step}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
              step < state.step && 'border-primary bg-primary text-primary-fg',
              step === state.step && 'border-primary text-primary',
              step > state.step && 'border-border text-fg-muted',
            )}
            aria-current={step === state.step ? 'step' : undefined}
          >
            {step < state.step ? <Check className="size-4" aria-hidden="true" /> : step}
          </li>
        ))}
      </ol>

      <Card>
        {/* ── Étape 1 — Choix du champ ───────────────────────────────────── */}
        {state.step === 1 && (
          <>
            <CardHeader>
              <CardTitle>{t('steps.1.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CORRECTABLE_FIELDS.map((field) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => setField(field)}
                    className={cn(
                      'rounded-base border p-4 text-left transition-colors',
                      'hover:border-primary hover:bg-primary-50/30',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      state.field === field
                        ? 'border-primary bg-primary-50 ring-2 ring-primary/20'
                        : 'border-border',
                    )}
                    aria-pressed={state.field === field}
                  >
                    <p className="font-medium">{t(`fields.${field}.label`)}</p>
                    <p className="mt-1 text-xs text-fg-muted">{t(`fields.${field}.help`)}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </>
        )}

        {/* ── Étape 2 — Nouvelle valeur + motif ───────────────────────────── */}
        {state.step === 2 && state.field && (
          <>
            <CardHeader>
              <CardTitle>{t('steps.2.title')}</CardTitle>
              <p className="text-sm text-fg-muted">
                {t('steps.2.subtitle', { field: t(`fields.${state.field}.label`) })}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="proposedValue">{t('steps.2.proposedValue')}</Label>
                <Input
                  id="proposedValue"
                  value={state.proposedValue}
                  onChange={(e) => setState((s) => ({ ...s, proposedValue: e.target.value }))}
                  maxLength={200}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="reason">{t('steps.2.reason')}</Label>
                <textarea
                  id="reason"
                  value={state.reason}
                  onChange={(e) => setState((s) => ({ ...s, reason: e.target.value }))}
                  rows={4}
                  minLength={10}
                  maxLength={2000}
                  required
                  className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-describedby="reason-help"
                />
                <p id="reason-help" className="mt-1 text-xs text-fg-muted">
                  {t('steps.2.reasonHelp')} ({state.reason.length}/2000)
                </p>
              </div>
            </CardContent>
          </>
        )}

        {/* ── Étape 3 — Justificatif (upload mock, fichier non envoyé) ─────── */}
        {state.step === 3 && (
          <>
            <CardHeader>
              <CardTitle>{t('steps.3.title')}</CardTitle>
              <p className="text-sm text-fg-muted">{t('steps.3.subtitle')}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Input fichier réel, masqué — déclenché par la zone ci-dessous. */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => handleFiles(e.target.files)}
              />

              {!file ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFiles(e.dataTransfer.files);
                  }}
                  className={cn(
                    'flex w-full flex-col items-center justify-center gap-2 rounded-base border-2 border-dashed p-8 text-center transition-colors',
                    'hover:border-primary hover:bg-primary-50/30',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isDragging ? 'border-primary bg-primary-50/50' : 'border-border',
                  )}
                >
                  <UploadCloud className="size-8 text-fg-muted" aria-hidden="true" />
                  <span className="font-medium">{t('steps.3.dropPrompt')}</span>
                  <span className="text-xs text-fg-muted">{t('steps.3.formats')}</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-base border border-border bg-primary-50/30 p-4">
                  <FileText className="size-8 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fg-muted">{t('steps.3.selectedLabel')}</p>
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-xs text-fg-muted">{formatSize(file.size)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={clearFile}>
                    <X className="size-4" aria-hidden="true" />
                    {t('steps.3.remove')}
                  </Button>
                </div>
              )}

              {uploadError && (
                <Alert variant="danger">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}

              <p className="text-xs text-fg-muted">{t('steps.3.demoNote')}</p>
            </CardContent>
          </>
        )}

        {/* ── Étape 4 — Récapitulatif ─────────────────────────────────────── */}
        {state.step === 4 && state.field && (
          <>
            <CardHeader>
              <CardTitle>{t('steps.4.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-fg-muted">{t('summary.nina')}</dt>
                <dd className="font-mono">{nina}</dd>
                <dt className="text-fg-muted">{t('summary.field')}</dt>
                <dd className="font-medium">{t(`fields.${state.field}.label`)}</dd>
                <dt className="text-fg-muted">{t('summary.newValue')}</dt>
                <dd className="font-medium">{state.proposedValue}</dd>
                <dt className="text-fg-muted">{t('summary.reason')}</dt>
                <dd className="whitespace-pre-wrap">{state.reason}</dd>
                <dt className="text-fg-muted">{t('summary.justification')}</dt>
                <dd className="font-medium">{file ? file.name : t('summary.justificationNone')}</dd>
              </dl>
              <Alert>
                <AlertTitle>{t('summary.processingTitle')}</AlertTitle>
                <AlertDescription>{t('summary.processingBody')}</AlertDescription>
              </Alert>
              {error && (
                <Alert variant="danger">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertTitle>{t('summary.error')}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </>
        )}

        <CardFooter className="justify-between border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={prev}
            disabled={state.step === 1 || isSubmitting}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {t('nav.previous')}
          </Button>
          {state.step < 4 ? (
            <Button type="button" onClick={next} disabled={!canContinue}>
              {t('nav.next')}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {t('nav.submit')}
            </Button>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
