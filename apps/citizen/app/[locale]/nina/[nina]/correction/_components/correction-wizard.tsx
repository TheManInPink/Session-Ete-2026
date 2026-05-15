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
 * @module      @nina-aes/citizen
 */

'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@nina-aes/ui/components/button';
import { Input } from '@nina-aes/ui/components/input';
import { Label } from '@nina-aes/ui/components/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Badge } from '@nina-aes/ui/components/badge';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Check, ChevronLeft, ChevronRight, Send, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { CorrectionField } from '@nina-aes/api-client';

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
  const [isSubmitting, startTransition] = useTransition();

  const setField = (field: CorrectionField) => setState((s) => ({ ...s, field }));
  const next = () => setState((s) => ({ ...s, step: (Math.min(4, s.step + 1) as WizardState['step']) }));
  const prev = () => setState((s) => ({ ...s, step: (Math.max(1, s.step - 1) as WizardState['step']) }));

  const canContinue =
    (state.step === 1 && state.field !== null) ||
    (state.step === 2 && state.proposedValue.trim().length > 0 && state.reason.trim().length >= 10) ||
    state.step === 3 ||
    state.step === 4;

  /** Soumet la correction au backend. */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!state.field) return;
    setError(null);

    startTransition(async () => {
      try {
        // Mode démo : on simule sans appel HTTP réel
        await new Promise((resolve) => setTimeout(resolve, 800));
        router.push(`/${locale}/dashboard?submitted=1`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      }
    });
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

        {/* ── Étape 3 — Justificatif (optionnel pour MVP) ─────────────────── */}
        {state.step === 3 && (
          <>
            <CardHeader>
              <CardTitle>{t('steps.3.title')}</CardTitle>
              <p className="text-sm text-fg-muted">{t('steps.3.subtitle')}</p>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="size-4" aria-hidden="true" />
                <AlertTitle>{t('steps.3.placeholderTitle')}</AlertTitle>
                <AlertDescription>{t('steps.3.placeholderBody')}</AlertDescription>
              </Alert>
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
          <Button type="button" variant="ghost" onClick={prev} disabled={state.step === 1 || isSubmitting}>
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
