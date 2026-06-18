/**
 * @file        data-grid.tsx
 * @description DataGrid générique présentationnel (écrans admin AD-02/AD-03) —
 *              composé SUR les primitives Table + Checkbox + Button + Select.
 *              ENTIÈREMENT CONTRÔLÉ : il ne trie / pagine / filtre PAS lui-même ;
 *              l'application pilote tout via callbacks et le composant ne fait que rendre.
 *              A11y : vraie <table> sémantique (suffisant et accessible), avec
 *              aria-sort sur les colonnes triables. On n'invente PAS role="grid".
 *              EXCEPTION style maison : composant générique <T> ⇒ fonction simple
 *              (React.forwardRef perd la généricité), donc PAS de forwardRef ici.
 * @module      @nina-aes/ui
 */

'use client';

import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

/**
 * Définition d'une colonne du DataGrid.
 *
 * @template T - Type d'une ligne de données.
 */
export interface DataGridColumn<T> {
  /** Identifiant stable de la colonne (utilisé pour le tri et la clé React). */
  id: string;
  /** Contenu de l'en-tête (texte ou nœud). */
  header: React.ReactNode;
  /** Fonction de rendu d'une cellule pour une ligne donnée. */
  cell: (row: T) => React.ReactNode;
  /** Si `true`, l'en-tête devient un bouton de tri (piloté via `onSortChange`). */
  sortable?: boolean;
  /** Alignement horizontal du contenu de la colonne. */
  align?: 'left' | 'right' | 'center';
  /** Classes supplémentaires sur la cellule d'en-tête (<th>). */
  headerClassName?: string;
  /** Classes supplémentaires sur les cellules de corps (<td>). */
  className?: string;
}

/**
 * Props du DataGrid — TOUT est contrôlé par l'application.
 *
 * @template T - Type d'une ligne de données.
 */
export interface DataGridProps<T> {
  /** Définition ordonnée des colonnes. */
  columns: DataGridColumn<T>[];
  /** Lignes de données à afficher (déjà triées/paginées par l'app). */
  rows: T[];
  /** Extrait l'identifiant stable d'une ligne (sélection + clé React). */
  getRowId: (row: T) => string;
  /** Légende accessible de la table (<caption>). */
  caption?: string;
  /** Active la colonne de cases à cocher de sélection. */
  selectable?: boolean;
  /** Identifiants des lignes actuellement sélectionnées. */
  selectedIds?: string[];
  /** Callback de changement de sélection (nouvelle liste d'identifiants). */
  onSelectionChange?: (ids: string[]) => void;
  /** État de tri courant (colonne + direction). */
  sort?: { columnId: string; dir: 'asc' | 'desc' };
  /** Callback de changement de tri. */
  onSortChange?: (s: { columnId: string; dir: 'asc' | 'desc' }) => void;
  /** Page courante (1-indexée). */
  page?: number;
  /** Taille de page courante. */
  pageSize?: number;
  /** Nombre total de pages. */
  pageCount?: number;
  /** Nombre total de résultats (toutes pages confondues). */
  total?: number;
  /** Options proposées pour le sélecteur « Lignes par page ». */
  pageSizeOptions?: number[];
  /** Callback de changement de page. */
  onPageChange?: (p: number) => void;
  /** Callback de changement de taille de page. */
  onPageSizeChange?: (s: number) => void;
  /** Rendu des actions par ligne (ajoute une colonne d'actions à droite). */
  rowActions?: (row: T) => React.ReactNode;
  /** Barre d'outils (filtres) affichée au-dessus de la table. */
  toolbar?: React.ReactNode;
  /** Texte affiché lorsque `rows` est vide. */
  emptyText?: string;
  /** Classes supplémentaires sur le conteneur racine. */
  className?: string;
}

/**
 * Grille de données générique pour les écrans admin.
 *
 * Le composant est purement présentationnel : il restitue les `rows` telles
 * quelles et remonte toutes les intentions (tri, sélection, pagination) via
 * callbacks. Aucun état interne de données n'est conservé.
 *
 * NOTE : ce composant est une fonction générique simple (pas `React.forwardRef`)
 * car `forwardRef` ne préserve pas le paramètre de type `<T>`.
 *
 * @example
 *   <DataGrid
 *     columns={cols}
 *     rows={page}
 *     getRowId={(r) => r.id}
 *     selectable
 *     selectedIds={ids}
 *     onSelectionChange={setIds}
 *     sort={sort}
 *     onSortChange={setSort}
 *     page={1}
 *     pageSize={25}
 *     pageCount={4}
 *     total={87}
 *   />
 */
export function DataGrid<T>({
  columns,
  rows,
  getRowId,
  caption,
  selectable = false,
  selectedIds,
  onSelectionChange,
  sort,
  onSortChange,
  page,
  pageSize,
  pageCount,
  total,
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
  rowActions,
  toolbar,
  emptyText = 'Aucun résultat',
  className,
}: DataGridProps<T>) {
  // Ensemble des identifiants sélectionnés pour des lookups O(1).
  const selectedSet = React.useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  // États de l'en-tête de sélection : tout coché / partiellement coché.
  const allRowIds = React.useMemo(() => rows.map(getRowId), [rows, getRowId]);
  const selectedOnPage = allRowIds.filter((id) => selectedSet.has(id)).length;
  const allSelected = rows.length > 0 && selectedOnPage === rows.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  /** Bascule la case « tout sélectionner » de la page courante. */
  const handleToggleAll = (next: boolean) => {
    if (!onSelectionChange) return;
    const base = new Set(selectedIds ?? []);
    if (next) {
      allRowIds.forEach((id) => base.add(id));
    } else {
      allRowIds.forEach((id) => base.delete(id));
    }
    onSelectionChange(Array.from(base));
  };

  /** Bascule la sélection d'une ligne donnée. */
  const handleToggleRow = (id: string, next: boolean) => {
    if (!onSelectionChange) return;
    const base = new Set(selectedIds ?? []);
    if (next) {
      base.add(id);
    } else {
      base.delete(id);
    }
    onSelectionChange(Array.from(base));
  };

  /** Bascule le tri d'une colonne (asc ↔ desc, asc par défaut). */
  const handleSort = (columnId: string) => {
    if (!onSortChange) return;
    const dir: 'asc' | 'desc' = sort?.columnId === columnId && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ columnId, dir });
  };

  // Nombre total de colonnes rendues (sélection + données + actions) pour colSpan.
  const totalColumns = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  // Pagination : valeurs par défaut sûres si non fournies.
  const currentPage = page ?? 1;
  const totalPages = pageCount ?? 1;
  const resultCount = total ?? rows.length;

  /** Classe d'alignement horizontal pour une colonne. */
  const alignClass = (align: DataGridColumn<T>['align']) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className={cn('rounded-base border border-border bg-bg-card', className)}>
      {/* Barre d'outils (filtres) optionnelle, au-dessus de la table. */}
      {toolbar ? (
        <div className="flex items-center gap-2 border-b border-border p-3">{toolbar}</div>
      ) : null}

      <Table>
        {caption ? <TableCaption>{caption}</TableCaption> : null}

        <TableHeader>
          <TableRow>
            {/* Colonne 0 : case « tout sélectionner ». */}
            {selectable ? (
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(value) => handleToggleAll(value === true)}
                  aria-label="Tout sélectionner"
                />
              </TableHead>
            ) : null}

            {columns.map((column) => {
              const isSorted = sort?.columnId === column.id;
              const ariaSort: React.AriaAttributes['aria-sort'] = column.sortable
                ? isSorted
                  ? sort?.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined;

              return (
                <TableHead
                  key={column.id}
                  aria-sort={ariaSort}
                  className={cn(alignClass(column.align), column.headerClassName)}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-fg',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                      )}
                    >
                      <span>{column.header}</span>
                      {isSorted ? (
                        sort?.dir === 'asc' ? (
                          <ChevronUp className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-3.5" aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}

            {/* Colonne d'actions à droite. */}
            {rowActions ? (
              <TableHead className="w-px text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={totalColumns} className="py-10 text-center text-fg-muted">
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              const isSelected = selectedSet.has(id);

              return (
                <TableRow key={id} data-state={isSelected ? 'selected' : undefined}>
                  {selectable ? (
                    <TableCell className="w-12">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(value) => handleToggleRow(id, value === true)}
                        aria-label="Sélectionner la ligne"
                      />
                    </TableCell>
                  ) : null}

                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(alignClass(column.align), column.className)}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}

                  {rowActions ? (
                    <TableCell className="w-px text-right">{rowActions(row)}</TableCell>
                  ) : null}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Pied : total à gauche, taille de page + navigation à droite. */}
      <div className="flex items-center justify-between gap-4 border-t border-border p-3 text-sm text-fg-muted">
        <span>{resultCount} résultats</span>

        <div className="flex items-center gap-4">
          {onPageSizeChange ? (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Lignes par page</span>
              <Select
                value={pageSize !== undefined ? String(pageSize) : undefined}
                onValueChange={(value) => onPageSizeChange(Number(value))}
              >
                <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Lignes par page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={currentPage <= 1}
              onClick={() => onPageChange?.(currentPage - 1)}
              aria-label="Page précédente"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="whitespace-nowrap">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange?.(currentPage + 1)}
              aria-label="Page suivante"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
DataGrid.displayName = 'DataGrid';
