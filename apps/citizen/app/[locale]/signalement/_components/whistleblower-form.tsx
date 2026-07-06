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

import { useState, type SyntheticEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@nina-aes/ui/components/button';
import { Label } from '@nina-aes/ui/components/label';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Send, Loader2, AlertCircle, Copy, Check, ShieldCheck } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { AlertCategory, FineSeverity } from '@nina-aes/api-client';
import {
  UI_CATEGORY_TO_FINE_CLASSIFICATION,
  MAX_SEALED_CIPHERTEXT_B64,
} from '@nina-aes/api-client';
import { useSigacPublicKey, useSubmitSealedReport } from '@nina-aes/api-client/react';
import { sealReportSealedBoxX25519 } from '../../../../lib/sigac/seal';

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
  const [receipt, setReceipt] = useState<{ token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sealing, setSealing] = useState(false);
  // Clé publique procureur (pour sceller côté navigateur) + mutation de dépôt.
  // Transport anonyme : sans cookie ni correlation-id (cf. lib/api/browser.ts).
  const publicKeyQuery = useSigacPublicKey();
  const submitReport = useSubmitSealedReport();
  const keyReady = !!publicKeyQuery.data?.public_key;
  const keyUnavailable =
    publicKeyQuery.isError || (!!publicKeyQuery.data && !publicKeyQuery.data.public_key);
  const isPending = submitReport.isPending || sealing;

  const handleCopy = (token: string) => {
    void navigator.clipboard?.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canSubmit =
    state.category !== '' &&
    state.description.trim().length >= 200 &&
    state.consentGiven &&
    keyReady;

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    const category = state.category;
    if (category === '') return;
    setError(null);

    const pk = publicKeyQuery.data;
    // 🔒 FAIL-CLOSED : sans clé publique valide, on NE soumet PAS. Jamais de
    // repli sur un envoi en clair (ce serait la faille critique qu'on ferme).
    if (!pk || !pk.public_key) {
      setError(t('form.keyUnavailable'));
      return;
    }
    if (pk.scheme !== 'SEALED_BOX_X25519') {
      // Le formulaire web autorise des descriptions longues (> 2000 car.) qui
      // ne tiennent pas dans un bloc RSA-OAEP : seul le sealed box X25519 est
      // supporté ici (chiffrement hybride implicite, longueur arbitraire).
      setError(t('form.schemeUnsupported'));
      return;
    }

    const fineClassification = UI_CATEGORY_TO_FINE_CLASSIFICATION[category];
    // Sévérité fine : le procureur la ré-évalue hors-ligne après déchiffrement.
    const fineSeverity: FineSeverity = 'MEDIUM';

    // La localisation approximative est EMBARQUÉE dans le message chiffré (elle
    // ne doit pas voyager en clair). Seules classification/sévérité restent en
    // clair (limite backend documentée).
    const locationParts = [state.region.trim(), state.cercle.trim()].filter(Boolean);
    const message =
      state.description.trim() +
      (locationParts.length ? `\n\n[Localisation approximative] ${locationParts.join(' / ')}` : '');

    setSealing(true);
    try {
      const ciphertextB64 = await sealReportSealedBoxX25519(
        { message, classification: fineClassification, severity: fineSeverity },
        pk.public_key,
      );
      if (ciphertextB64.length > MAX_SEALED_CIPHERTEXT_B64) {
        setError(t('form.tooLong'));
        return;
      }
      const data = await submitReport.mutateAsync({
        ciphertext_b64: ciphertextB64,
        scheme: pk.scheme,
        cipher_kid: pk.cipher_kid,
        fine_classification: fineClassification,
        fine_severity: fineSeverity,
      });
      setReceipt({ token: data.tracking_token });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.error'));
    } finally {
      setSealing(false);
    }
  };

  // ── Reçu post-soumission : remplace le formulaire ───────────────────────
  if (receipt) {
    return (
      <div className="space-y-4">
        <Alert className="border-success bg-success-50">
          <AlertTitle>{t('receipt.title')}</AlertTitle>
          <AlertDescription>{t('receipt.body')}</AlertDescription>
        </Alert>
        <div className="rounded-base border border-border bg-bg-muted p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            {t('receipt.tokenLabel')}
          </p>
          <p className="mt-2 select-all break-all rounded-base border border-border bg-bg px-3 py-2 font-mono text-sm text-fg">
            {receipt.token}
          </p>
          <Button
            type="button"
            variant={copied ? 'outline' : 'ghost'}
            size="sm"
            className={cn('mt-2', copied && 'text-success-700')}
            onClick={() => handleCopy(receipt.token)}
            aria-live="polite"
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? t('receipt.copied') : t('receipt.copy')}
          </Button>
        </div>
        <Alert variant="danger" role="alert">
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
      {/* Réassurance : chiffrement de bout en bout côté navigateur (informatif). */}
      <Alert variant="success" role="status">
        <ShieldCheck className="size-4" aria-hidden="true" />
        <AlertDescription>{t('form.encryptedNotice')}</AlertDescription>
      </Alert>

      {/* Clé publique indisponible → soumission bloquée (fail-closed, jamais de clair). */}
      {keyUnavailable && (
        <Alert variant="danger" role="alert">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>{t('form.error')}</AlertTitle>
          <AlertDescription>{t('form.keyUnavailable')}</AlertDescription>
        </Alert>
      )}

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
          minLength={200}
          maxLength={2000}
          required
          placeholder={t('form.descriptionPlaceholder')}
          className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-describedby="description-help"
        />
        <p id="description-help" className="mt-1 text-xs text-fg-muted">
          {/* Bornes 200-2000 (maquette PC-06) : garantit aussi un ciphertext base64 ≤ 8192. */}
          {t('form.descriptionHelp')} ({state.description.length}/2000)
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
        <Alert variant="danger" role="alert">
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
        {sealing ? t('form.encrypting') : t('form.submit')}
      </Button>
    </form>
  );
}
