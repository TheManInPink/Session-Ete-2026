/**
 * @file        whistleblower-form.tsx
 * @description Formulaire de signalement anonyme SIGAC (PC-06) — compose Alert +
 *              RadioGroup + Textarea + UploadZone + Button. SÉCURITÉ : ne collecte
 *              AUCUN identifiant (ni nom, ni e-mail, ni téléphone), `autoComplete="off"`,
 *              aucun cookie ni empreinte ni traçage. A11y : labels reliés (htmlFor/id),
 *              compteur de caractères, radios opérables au clavier (Radix), icônes
 *              décoratives masquées aux lecteurs d'écran.
 * @module      @nina-aes/ui
 */

'use client';

import { ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';
import { UploadZone, type UploadFile } from './upload-zone';

/** Option de catégorie de signalement (valeur technique + libellé affiché). */
export type WhistleblowerCategoryOption = {
  /** Valeur technique transmise via `onCategoryChange`. */
  value: string;
  /** Libellé lisible affiché à côté du bouton radio. */
  label: string;
};

/** Catégories par défaut proposées au lanceur d'alerte. */
const DEFAULT_CATEGORIES: WhistleblowerCategoryOption[] = [
  { value: 'pots-de-vin', label: 'Pots-de-vin' },
  { value: 'faux-documents', label: 'Faux documents' },
  { value: 'favoritisme', label: 'Favoritisme' },
  { value: 'abus-de-pouvoir', label: 'Abus de pouvoir' },
  { value: 'marches-publics', label: 'Marchés publics' },
  { value: 'autre', label: 'Autre' },
];

export interface WhistleblowerFormProps extends React.HTMLAttributes<HTMLFormElement> {
  /** Catégories proposées (défaut : 6 catégories SIGAC). */
  categories?: WhistleblowerCategoryOption[];
  /** Catégorie actuellement sélectionnée (valeur contrôlée). */
  category?: string;
  /** Appelé quand la catégorie change. */
  onCategoryChange?: (value: string) => void;
  /** Texte de description des faits (valeur contrôlée). */
  description: string;
  /** Appelé à chaque modification de la description. */
  onDescriptionChange: (value: string) => void;
  /** Longueur maximale de la description (défaut 2000). */
  maxDescription?: number;
  /** Pièces jointes en cours/terminées affichées sous la zone. */
  files?: UploadFile[];
  /** Appelé quand des fichiers sont sélectionnés. */
  onFilesSelected?: (files: File[]) => void;
  /** Retire une pièce jointe de la liste. */
  onRemoveFile?: (id: string) => void;
  /** Soumission du signalement (collecte uniquement — voir note réseau). */
  onSubmit: () => void;
  /** Annulation/abandon du formulaire. */
  onCancel?: () => void;
  /** Indique une soumission en cours (désactive + spinner). */
  submitting?: boolean;
}

/**
 * Formulaire de signalement anonyme SIGAC (PC-06).
 *
 * SÉCURITÉ — ANONYMAT STRICT : ce composant ne contient AUCUN champ
 * identifiant (nom, e-mail, téléphone) et désactive l'autocomplétion du
 * navigateur. Il ne pose aucun cookie, ne calcule aucune empreinte et ne
 * réalise AUCUN appel réseau : il se contente de COLLECTER les données et
 * d'appeler `onSubmit`. La soumission réseau anonyme reste la responsabilité
 * du consommateur, qui DOIT l'effectuer sans cookies ni en-têtes
 * d'identification (par ex. `fetch(url, { credentials: 'omit' })`).
 *
 * @example
 *   <WhistleblowerForm
 *     description={desc}
 *     onDescriptionChange={setDesc}
 *     category={cat}
 *     onCategoryChange={setCat}
 *     onSubmit={() => sendAnonymous(payload)}
 *   />
 */
export const WhistleblowerForm = React.forwardRef<HTMLFormElement, WhistleblowerFormProps>(
  (
    {
      categories = DEFAULT_CATEGORIES,
      category,
      onCategoryChange,
      description,
      onDescriptionChange,
      maxDescription = 2000,
      files,
      onFilesSelected,
      onRemoveFile,
      onSubmit,
      onCancel,
      submitting = false,
      className,
      ...props
    },
    ref,
  ) => {
    // Identifiants stables pour relier labels et champs (SSR-safe).
    const categoryGroupId = React.useId();
    const descriptionId = React.useId();
    const counterId = React.useId();

    // Compteur : passe en destructive lorsque la limite est atteinte.
    const atLimit = description.length >= maxDescription;

    return (
      <form
        ref={ref}
        // Handler inline : `e` est typé par contexte via la prop `onSubmit` du
        // <form>, sans référencer `React.FormEvent` (déprécié @types/react 19).
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        autoComplete="off"
        className={cn('space-y-6', className)}
        {...props}
      >
        {/* 1. Bandeau anonymat — `hideIcon` neutralise l'icône Info par défaut
            d'Alert au profit de l'icône bouclier (positionnée en svg absolu). */}
        <Alert variant="info" role="status" hideIcon>
          <ShieldCheck className="size-5" aria-hidden="true" />
          <AlertTitle>🛡 Mode anonyme actif</AlertTitle>
          <AlertDescription>
            {"Aucune adresse IP, cookie ou identifiant n'est enregistré."}
          </AlertDescription>
        </Alert>

        {/* 2. Catégorie de signalement */}
        <div className="space-y-2">
          <Label id={categoryGroupId}>Catégorie de signalement *</Label>
          <RadioGroup
            value={category}
            onValueChange={onCategoryChange}
            aria-labelledby={categoryGroupId}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {categories.map((option) => {
              const optionId = `${categoryGroupId}-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={optionId}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-base border border-border p-3',
                    'text-sm text-fg transition-colors hover:bg-bg-muted',
                  )}
                >
                  <RadioGroupItem id={optionId} value={option.value} />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </RadioGroup>
        </div>

        {/* 3. Description des faits */}
        <div className="space-y-2">
          <Label htmlFor={descriptionId}>Description *</Label>
          <Textarea
            id={descriptionId}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            maxLength={maxDescription}
            aria-describedby={counterId}
            placeholder="Décrivez les faits avec autant de détails que possible…"
          />
          <p
            id={counterId}
            className={cn('text-right text-xs', atLimit ? 'text-destructive' : 'text-fg-muted')}
          >
            {description.length}/{maxDescription}
          </p>
        </div>

        {/* 4. Pièces jointes (facultatif) */}
        <div className="space-y-2">
          <Label>Pièces jointes (audio, photo, doc) — facultatif</Label>
          <UploadZone
            multiple
            files={files}
            onFilesSelected={onFilesSelected ?? (() => {})}
            onRemove={onRemoveFile}
            hintText="Max 5 fichiers · 50 Mo total"
          />
        </div>

        {/* 5. Rappel sur le token de suivi */}
        <Alert variant="warning" role="status">
          <AlertDescription>
            {"⚠ Conservez bien le token qui vous sera remis pour suivre l'instruction."}
          </AlertDescription>
        </Alert>

        {/* 6. Pied : annuler / soumettre */}
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" variant="destructive" loading={submitting}>
            Soumettre le signalement →
          </Button>
        </div>
      </form>
    );
  },
);
WhistleblowerForm.displayName = 'WhistleblowerForm';
