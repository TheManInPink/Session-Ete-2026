/**
 * @file        upload-zone.tsx
 * @description Zone de téléversement (PC-03 justificatifs) — glisser-déposer
 *              présentationnel + callbacks, SANS XHR réel. A11y : zone
 *              opérable au clavier (role="button", Enter/Espace), input fichier
 *              masqué relié à la zone, libellés et icônes décoratives masquées
 *              aux lecteurs d'écran.
 * @module      @nina-aes/ui
 */

'use client';

import { AlertCircle, CheckCircle2, FileText, Upload, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';

/** État d'un fichier dans la liste de téléversement. */
export interface UploadFile {
  /** Identifiant stable (clé de liste + ciblage des callbacks). */
  id: string;
  /** Nom du fichier affiché. */
  name: string;
  /** Libellé de taille déjà formaté (ex. « 2,3 Mo »). */
  sizeLabel?: string;
  /** Statut courant du téléversement. */
  status: 'uploading' | 'success' | 'error';
  /** Progression 0-100 (utilisée si `status === 'uploading'`). */
  progress?: number;
  /** Message d'erreur affiché si `status === 'error'`. */
  errorText?: string;
}

export interface UploadZoneProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Appelé quand des fichiers sont sélectionnés (clic, clavier ou dépôt). */
  onFilesSelected: (files: File[]) => void;
  /** Types acceptés (attribut `accept` de l'input). */
  accept?: string;
  /** Autorise la sélection de plusieurs fichiers. */
  multiple?: boolean;
  /** Texte d'aide secondaire (formats, taille max). */
  hintText?: string;
  /** Libellé principal de la zone (sert aussi d'`aria-label`). */
  labelText?: string;
  /** Liste des fichiers en cours/terminés à afficher sous la zone. */
  files?: UploadFile[];
  /** Retire un fichier de la liste. */
  onRemove?: (id: string) => void;
  /** Relance le téléversement d'un fichier en erreur. */
  onRetry?: (id: string) => void;
  /** Remplace un fichier déjà téléversé. */
  onReplace?: (id: string) => void;
  /** Désactive toute interaction. */
  disabled?: boolean;
}

/**
 * Zone de glisser-déposer pour les justificatifs (PC-03).
 *
 * Composant purement présentationnel : il ne réalise aucun envoi réseau et
 * délègue tout au parent via callbacks. L'affichage de la progression et des
 * statuts est piloté par la prop `files`.
 *
 * @example
 *   <UploadZone
 *     onFilesSelected={handle}
 *     files={files}
 *     onRemove={remove}
 *     onRetry={retry}
 *     onReplace={replace}
 *   />
 */
export const UploadZone = React.forwardRef<HTMLDivElement, UploadZoneProps>(
  (
    {
      onFilesSelected,
      accept = '.pdf,.jpg,.jpeg,.png,.heic',
      multiple = false,
      hintText = 'PDF, JPG, PNG · 10 Mo max',
      labelText = 'Glissez un fichier ici, ou cliquez pour parcourir',
      files,
      onRemove,
      onRetry,
      onReplace,
      disabled = false,
      className,
      ...props
    },
    ref,
  ) => {
    // Survol de glisser : pilote la mise en évidence de la zone.
    const [isDragging, setIsDragging] = React.useState(false);
    // Référence vers l'input fichier masqué, déclenché par la zone.
    const inputRef = React.useRef<HTMLInputElement>(null);

    /** Ouvre la fenêtre de sélection de fichiers (sauf si désactivé). */
    const openPicker = React.useCallback(() => {
      if (disabled) return;
      inputRef.current?.click();
    }, [disabled]);

    /** Sélection via l'input fichier ; réinitialise la valeur ensuite. */
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilesSelected(Array.from(e.target.files ?? []));
      // Permet de re-sélectionner le même fichier juste après.
      e.target.value = '';
    };

    /** Active la zone au clavier (Enter / Espace). */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (disabled) return;
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      onFilesSelected(Array.from(e.dataTransfer.files));
    };

    return (
      <div ref={ref} className={cn('flex flex-col gap-3', className)} {...props}>
        {/* Zone de dépôt opérable souris + clavier */}
        <div
          role="button"
          tabIndex={0}
          aria-label={labelText}
          aria-disabled={disabled || undefined}
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center gap-2 rounded-base border-2 border-dashed p-8 text-center transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            isDragging ? 'border-primary bg-primary/5' : 'border-border bg-bg-muted',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          <Upload
            className={cn('size-12', isDragging ? 'text-primary' : 'text-fg-muted')}
            aria-hidden="true"
          />
          <span className="text-sm text-fg">{labelText}</span>
          <span className="text-xs text-fg-muted">{hintText}</span>

          {/* Input fichier masqué, relié à la zone */}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            aria-hidden="true"
            tabIndex={-1}
            onChange={handleInputChange}
          />
        </div>

        {/* Liste des fichiers (progression / succès / erreur) */}
        {files && files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-base border border-border p-3"
              >
                <FileText className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm text-fg">{file.name}</span>
                    {file.sizeLabel && (
                      <span className="shrink-0 text-xs text-fg-muted">{file.sizeLabel}</span>
                    )}
                  </div>

                  {/* En cours : barre de progression */}
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="w-full" />
                  )}

                  {/* Succès : confirmation */}
                  {file.status === 'success' && (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                      Téléversement réussi
                    </span>
                  )}

                  {/* Erreur : message */}
                  {file.status === 'error' && (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                      {file.errorText}
                    </span>
                  )}
                </div>

                {/* Actions contextuelles selon le statut */}
                <div className="flex shrink-0 items-center gap-1">
                  {file.status === 'success' && onReplace && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onReplace(file.id)}
                    >
                      Remplacer
                    </Button>
                  )}
                  {file.status === 'error' && onRetry && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRetry(file.id)}
                    >
                      Réessayer
                    </Button>
                  )}
                  {onRemove && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={file.status === 'uploading' ? 'Annuler' : 'Retirer'}
                      onClick={() => onRemove(file.id)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
UploadZone.displayName = 'UploadZone';
