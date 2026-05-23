/**
 * @file        whistleblower-form.tsx
 * @description Formulaire de signalement anonyme — strictement aucun champ
 *              identifiant (pas de nom, pas d'email, pas de téléphone).
 *
 *              Comportement strict pour préserver l'anonymat :
 *                - `fetch` sans `credentials` (pas de cookies envoyés)
 *                - aucun localStorage / sessionStorage écrit
 *                - aucun fingerprinting JS effectué côté client
 * @module      @nina-aes/citizen
 */

'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@nina-aes/ui/components/button';
import { Label } from '@nina-aes/ui/components/label';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Send, Loader2, AlertCircle, Copy } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { AlertCategory } from '@nina-aes/api-client';

const CATEGORIES: AlertCategory[] = [
  'BRIBERY',
  'FORGERY',
  'FAVORITISM',
  'ABUSE_OF_POWER',
  'PROCUREMENT',
  'OTHER',
];

interface FormState {
  category: AlertCategory | '';
  description: string;
  region: string;
  cercle: string;
  consentGiven: boolean;
}

export function WhistleblowerForm() {
  const t = useTranslations('signalement');
  const [state, setState] = useState<FormState>({
    category: '',
    description: '',
    region: '',
    cercle: '',
    consentGiven: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ token: string; alertId: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit =
    state.category !== '' && state.description.trim().length >= 50 && state.consentGiven;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        // En mode démo : on simule un succès et on génère un token fictif
        await new Promise((r) => setTimeout(r, 700));
        setReceipt({
          token: `vault:v3:${cryptoRandom(20)}`,
          alertId: cryptoRandom(8),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      }
    });
  };

  // ── Reçu post-soumission : remplace le formulaire ───────────────────────
  if (receipt) {
    return (
      <div className="space-y-4">
        <Alert className="border-success bg-success-50">
          <AlertTitle>{t('receipt.title')}</AlertTitle>
          <AlertDescription>{t('receipt.body')}</AlertDescription>
        </Alert>
        <div className="rounded-base border border-dashed border-border bg-bg-muted p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            {t('receipt.tokenLabel')}
          </p>
          <p className="mt-2 break-all font-mono text-sm">{receipt.token}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => navigator.clipboard?.writeText(receipt.token)}
          >
            <Copy className="size-4" aria-hidden="true" />
            {t('receipt.copy')}
          </Button>
        </div>
        <Alert variant="danger">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>{t('receipt.warningTitle')}</AlertTitle>
          <AlertDescription>{t('receipt.warningBody')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Formulaire ──────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Catégorie */}
      <fieldset>
        <legend className="mb-3 text-sm font-medium">{t('form.category')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CATEGORIES.map((cat) => (
            <label
              key={cat}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-base border p-3 text-sm transition-colors',
                'hover:border-primary hover:bg-primary-50/30',
                state.category === cat ? 'border-primary bg-primary-50' : 'border-border',
              )}
            >
              <input
                type="radio"
                name="category"
                value={cat}
                checked={state.category === cat}
                onChange={(e) =>
                  setState((s) => ({ ...s, category: e.target.value as AlertCategory }))
                }
                className="mt-0.5 size-4 accent-primary"
              />
              <span>{t(`form.categories.${cat}` as never)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Description */}
      <div>
        <Label htmlFor="description">{t('form.description')}</Label>
        <textarea
          id="description"
          value={state.description}
          onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
          rows={8}
          minLength={50}
          maxLength={8000}
          required
          placeholder={t('form.descriptionPlaceholder')}
          className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-describedby="description-help"
        />
        <p id="description-help" className="mt-1 text-xs text-fg-muted">
          {t('form.descriptionHelp')} ({state.description.length}/8000)
        </p>
      </div>

      {/* Localisation optionnelle */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="region">{t('form.region')}</Label>
          <input
            id="region"
            type="text"
            value={state.region}
            onChange={(e) => setState((s) => ({ ...s, region: e.target.value }))}
            maxLength={50}
            className="mt-1 flex h-10 w-full rounded-base border border-border bg-bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <Label htmlFor="cercle">{t('form.cercle')}</Label>
          <input
            id="cercle"
            type="text"
            value={state.cercle}
            onChange={(e) => setState((s) => ({ ...s, cercle: e.target.value }))}
            maxLength={50}
            className="mt-1 flex h-10 w-full rounded-base border border-border bg-bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Consentement */}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.consentGiven}
          onChange={(e) => setState((s) => ({ ...s, consentGiven: e.target.checked }))}
          className="mt-0.5 size-4 accent-primary"
          required
        />
        <span>{t('form.consent')}</span>
      </label>

      {error && (
        <Alert variant="danger">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>{t('form.error')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={!canSubmit || isPending}
        className="w-full"
        size="lg"
        variant="destructive"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        {t('form.submit')}
      </Button>
    </form>
  );
}

/** Génère une chaîne aléatoire courte côté client (uniquement pour la démo). */
function cryptoRandom(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
