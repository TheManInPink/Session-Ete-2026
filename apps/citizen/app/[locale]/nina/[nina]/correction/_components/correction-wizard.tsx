/**
 * @file        correction-wizard.tsx
 * @description Wizard 4 étapes : champ → nouvelle valeur → justificatif → confirmation.
 *
 *              États gérés en mémoire (useState) plutôt qu'en URL pour éviter de
 *              divulguer le NINA dans l'historique de navigation. La soumission
 *              finale appelle `clientApi.correction.submit()` via TanStack Query.
 *
 *              **Comparaison avant/après + pré-analyse (étape 2)** : quand la fiche
 *              est disponible (`citizen`), l'étape 2 affiche la valeur actuelle du
 *              champ et un indicateur de **similarité Jaro-Winkler** calculé
 *              localement (cf. `similarity.ts`). Ce n'est **pas** un score IA : il
 *              n'y a ni modèle ni appel réseau ; l'analyse officielle est faite par
 *              le service à la soumission. Sans fiche, l'étape 2 reste en une colonne.
 *
 *              **Mode démo** : si aucune API n'est joignable, on simule un succès
 *              et on redirige vers `/dashboard`. L'étape 3 (justificatif) valide le
 *              fichier localement mais ne l'envoie pas (document-service non
 *              connecté, cf. doc 10) — on réutilise la zone de dépôt partagée
 *              `UploadZone` mais on rend nous-mêmes une vignette honnête (« non
 *              envoyé ») plutôt que son statut « Téléversement réussi ».
 * @module      @nina-aes/citizen
 */

'use client';

import { useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatNina } from '@nina-aes/utils';
import { Button } from '@nina-aes/ui/components/button';
import { Input } from '@nina-aes/ui/components/input';
import { Label } from '@nina-aes/ui/components/label';
import { Badge } from '@nina-aes/ui/components/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Checkbox } from '@nina-aes/ui/components/checkbox';
import { Stepper } from '@nina-aes/ui/components/stepper';
import { AiScorePanel } from '@nina-aes/ui/components/business/ai-score-panel';
import { UploadZone } from '@nina-aes/ui/components/business/upload-zone';
import { ChevronLeft, ChevronRight, Send, Loader2, AlertCircle, FileText, X } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { CorrectionField } from '@nina-aes/api-client';
import { useSubmitCorrection } from '@nina-aes/api-client/react';
import { similarityScore } from './similarity';

/** Carte d'identité compacte + valeurs actuelles (comparaison avant/après). */
export interface CorrectionCitizen {
  fullName: string;
  initials: string;
  birthLabel: string;
  /** Vrai si les données proviennent du mode démo (déterministe). */
  synthetic: boolean;
  /** Valeur actuelle par champ corrigible (absente si non renseignée). */
  currentValues: Partial<Record<CorrectionField, string>>;
}

interface WizardProps {
  nina: string;
  locale: string;
  /** Fiche courante (best-effort) pour l'avant/après + la pré-analyse. */
  citizen?: CorrectionCitizen;
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
  /** Attestation sur l'honneur (étape 4) — obligatoire avant soumission. */
  certified: boolean;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  field: null,
  proposedValue: '',
  reason: '',
  justificationDocUrl: null,
  certified: false,
};

export function CorrectionWizard({ nina, locale, citizen }: WizardProps) {
  const t = useTranslations('correction');
  const router = useRouter();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const submitCorrection = useSubmitCorrection();
  const isSubmitting = submitCorrection.isPending;

  // ── Justificatif (étape 3) — upload mock : validé localement, jamais envoyé ─
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const setField = (field: CorrectionField) => setState((s) => ({ ...s, field }));
  const next = () =>
    setState((s) => ({ ...s, step: Math.min(4, s.step + 1) as WizardState['step'] }));
  const prev = () =>
    setState((s) => ({ ...s, step: Math.max(1, s.step - 1) as WizardState['step'] }));

  /** Valide puis « accepte » localement un fichier (aucun appel réseau). */
  const handleFiles = (files: File[]) => {
    setUploadError(null);
    const f = files[0];
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
  };

  /** Formate une taille d'octets en Ko/Mo lisible. */
  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
      : `${Math.max(1, Math.round(bytes / 1024))} Ko`;

  // ── Pré-analyse locale (étape 2) — similarité entre valeur actuelle et proposée.
  const currentValue = state.field ? citizen?.currentValues[state.field] : undefined;
  const proposedTrimmed = state.proposedValue.trim();
  const comparison =
    currentValue !== undefined && proposedTrimmed.length > 0
      ? { score: similarityScore(currentValue, proposedTrimmed) }
      : null;
  const hint =
    comparison === null
      ? null
      : comparison.score >= 85
        ? t('ai.hintHigh')
        : comparison.score < 60
          ? t('ai.hintLow')
          : null;

  const canContinue =
    (state.step === 1 && state.field !== null) ||
    (state.step === 2 &&
      state.proposedValue.trim().length > 0 &&
      state.reason.trim().length >= 10) ||
    state.step === 3 ||
    state.step === 4;

  const stepperSteps = [
    { label: t('steps.1.short') },
    { label: t('steps.2.short') },
    { label: t('steps.3.short') },
    { label: t('steps.4.short') },
  ];

  /** Soumet la correction au backend (mock → fixture, live → gateway via BFF). */
  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const field = state.field;
    if (!field) return;
    // Attestation obligatoire — garde-fou en plus du bouton désactivé.
    if (!state.certified) {
      setError(t('summary.certifyRequired'));
      return;
    }
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
      {/* Carte « fiche concernée » — contexte de la correction. */}
      {citizen && (
        <div className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-bg-card p-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-primary-50 text-lg font-semibold text-primary"
            aria-hidden="true"
          >
            {citizen.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-fg-muted">
              {t('citizenCard.title')}
            </p>
            <p className="truncate font-semibold text-fg">{citizen.fullName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-muted">
              <span className="font-mono">{formatNina(nina)}</span>
              <span>
                {t('citizenCard.birthLabel')} : {citizen.birthLabel}
              </span>
            </div>
          </div>
          {citizen.synthetic && <Badge variant="muted">{t('citizenCard.demoBadge')}</Badge>}
        </div>
      )}

      {/* Fil d'étapes (composant partagé, libellés courts). */}
      <Stepper
        steps={stepperSteps}
        current={state.step - 1}
        className="mb-8"
        aria-label={t('steps.ariaLabel')}
      />

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

        {/* ── Étape 2 — Nouvelle valeur + motif + pré-analyse ─────────────── */}
        {state.step === 2 && state.field && (
          <>
            <CardHeader>
              <CardTitle>{t('steps.2.title')}</CardTitle>
              <p className="text-sm text-fg-muted">
                {t('steps.2.subtitle', { field: t(`fields.${state.field}.label`) })}
              </p>
            </CardHeader>
            <CardContent>
              <div className={cn('grid gap-6', citizen && 'lg:grid-cols-[1fr_19rem]')}>
                {/* Colonne formulaire */}
                <div className="space-y-4">
                  {/* Valeur actuelle (lecture seule) — la moitié « avant ». */}
                  {currentValue !== undefined && (
                    <div>
                      <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                        {t('steps.2.currentLabel')}
                      </span>
                      <p className="mt-1 rounded-base border border-border bg-bg-muted px-3 py-2 font-medium text-fg">
                        {currentValue}
                      </p>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="proposedValue">{t('steps.2.proposedValue')}</Label>
                    <Input
                      id="proposedValue"
                      value={state.proposedValue}
                      onChange={(e) => setState((s) => ({ ...s, proposedValue: e.target.value }))}
                      maxLength={200}
                      required
                      autoComplete="off"
                      placeholder={currentValue ?? undefined}
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
                </div>

                {/* Colonne pré-analyse (similarité locale) — seulement si fiche connue. */}
                {citizen && (
                  <aside className="lg:border-l lg:border-border lg:pl-6">
                    <h3 className="text-sm font-semibold text-fg">{t('ai.title')}</h3>
                    {comparison ? (
                      <div className="mt-4 space-y-3">
                        <AiScorePanel
                          score={comparison.score}
                          bands={{
                            high: t('ai.bandHigh'),
                            medium: t('ai.bandMedium'),
                            low: t('ai.bandLow'),
                          }}
                        />
                        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-fg-muted">
                        {currentValue === undefined ? t('ai.unavailable') : t('ai.typePrompt')}
                      </p>
                    )}
                    <p className="mt-4 border-t border-border pt-3 text-xs text-fg-muted">
                      {t('ai.caption')}
                    </p>
                  </aside>
                )}
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
              {/* Zone de dépôt partagée (a11y clavier + glisser-déposer). On ne
                  passe PAS `files` : son statut « Téléversement réussi » serait
                  mensonger (le fichier n'est jamais envoyé) → vignette honnête ci-dessous. */}
              <UploadZone
                onFilesSelected={handleFiles}
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                labelText={t('steps.3.dropPrompt')}
                hintText={t('steps.3.formats')}
              />

              {file && (
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
                {currentValue !== undefined && (
                  <>
                    <dt className="text-fg-muted">{t('steps.2.currentLabel')}</dt>
                    <dd className="text-fg-muted line-through decoration-fg-muted/40">
                      {currentValue}
                    </dd>
                  </>
                )}
                <dt className="text-fg-muted">{t('summary.newValue')}</dt>
                <dd className="font-medium">{state.proposedValue}</dd>
                <dt className="text-fg-muted">{t('summary.reason')}</dt>
                <dd className="whitespace-pre-wrap">{state.reason}</dd>
                <dt className="text-fg-muted">{t('summary.justification')}</dt>
                <dd className="font-medium">{file ? file.name : t('summary.justificationNone')}</dd>
                {comparison && (
                  <>
                    <dt className="text-fg-muted">{t('ai.summaryLabel')}</dt>
                    <dd className="font-medium">
                      {comparison.score}/100{' '}
                      <span className="font-normal text-fg-muted">({t('ai.summaryHint')})</span>
                    </dd>
                  </>
                )}
              </dl>
              <Alert>
                <AlertTitle>{t('summary.processingTitle')}</AlertTitle>
                <AlertDescription>{t('summary.processingBody')}</AlertDescription>
              </Alert>

              {/* Attestation sur l'honneur — obligatoire (demande à portée légale). */}
              <div className="flex items-start gap-3 rounded-base border border-border p-3">
                <Checkbox
                  id="certify"
                  checked={state.certified}
                  onCheckedChange={(checked) =>
                    setState((s) => ({ ...s, certified: checked === true }))
                  }
                  className="mt-0.5"
                />
                <Label htmlFor="certify" className="text-sm font-normal leading-snug">
                  {t('summary.certifyLabel')}
                </Label>
              </div>

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
            <Button type="submit" disabled={isSubmitting || !state.certified}>
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
