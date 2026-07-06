/**
 * @file        corrections-client.tsx
 * @description Client component orchestrant le DataGrid AD-02 :
 *              - Données réelles via `useCorrections({ page: 1, pageSize: 50 })`
 *                (@nina-aes/api-client/react — mock ou live selon le provider)
 *                adaptées en `AdminCorrectionView` (lib/corrections/view-model)
 *              - TanStack Table 8 (sort, sélection multiple, pagination)
 *              - Filtres : recherche full-text NINA/nom, statut, région
 *              - Drawer détail (CorrectionDrawer) + mutations approve/reject
 *                (`useApproveCorrection` / `useRejectCorrection`)
 *
 *              Aucune mise à jour optimiste : la ligne ne change d'état
 *              qu'après succès de la mutation (invalidation TanStack Query →
 *              re-fetch). En cas d'erreur, l'état affiché reste celui du
 *              serveur et un toast d'erreur est montré.
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { useFormatter, useTranslations } from 'next-intl';
import {
  useApproveCorrection,
  useCorrections,
  useRejectCorrection,
} from '@nina-aes/api-client/react';
import type { CorrectionStatus } from '@nina-aes/api-client';
import { Button } from '@nina-aes/ui/components/button';
import { Card } from '@nina-aes/ui/components/card';
import { Checkbox } from '@nina-aes/ui/components/checkbox';
import { Skeleton } from '@nina-aes/ui/components/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nina-aes/ui/components/dropdown-menu';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import {
  regionOptions,
  toAdminCorrectionView,
  type AdminCorrectionView,
} from '../../../../../lib/corrections/view-model';
import { CorrectionDrawer } from './correction-drawer';
import { StatusBadge } from './status-badge';

/** Statuts proposés au filtre (seuls états produits par le workflow agent). */
const STATUS_FILTER: CorrectionStatus[] = ['UNDER_REVIEW', 'APPROVED', 'REJECTED'];

/** Toast local (succès ou erreur de mutation). */
interface ToastState {
  tone: 'success' | 'danger';
  title: string;
  body: string;
}

export function CorrectionsClient() {
  const t = useTranslations('admin.corrections');
  const tField = useTranslations('admin.corrections.field');
  const tStatus = useTranslations('admin.corrections.status');
  const format = useFormatter();

  // ── Données : page agent complète (50 = taille du magasin mock / 1re page live)
  const corrections = useCorrections({ page: 1, pageSize: 50 });
  const approve = useApproveCorrection();
  const reject = useRejectCorrection();

  const views = useMemo(
    () => (corrections.data?.items ?? []).map(toAdminCorrectionView),
    [corrections.data],
  );
  const regions = useMemo(() => regionOptions(views), [views]);

  // ── État local UI
  const [sorting, setSorting] = useState<SortingState>([{ id: 'submittedAt', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const isDeciding = approve.isPending || reject.isPending || bulkBusy;

  const showToast = (next: ToastState) => {
    setToast(next);
    setTimeout(() => setToast(null), 4_000);
  };

  /** Message d'erreur affichable (taxonomie ApiError → `message`). */
  const errorBody = (error: unknown): string =>
    error instanceof Error && error.message ? error.message : 'Réessayez ou contactez le support.';

  // ── Décisions — mutations réelles, sans mise à jour optimiste (pas de
  //    rollback nécessaire : l'UI ne change qu'après confirmation serveur).
  const decideApprove = async (id: string): Promise<boolean> => {
    try {
      await approve.mutateAsync(id);
      showToast({
        tone: 'success',
        title: t('toast.approvedTitle'),
        body: t('toast.approvedBody'),
      });
      return true;
    } catch (error) {
      showToast({ tone: 'danger', title: "Échec de l'approbation", body: errorBody(error) });
      return false;
    }
  };

  const decideReject = async (id: string, reason: string): Promise<boolean> => {
    try {
      await reject.mutateAsync({ id, reason });
      showToast({
        tone: 'success',
        title: t('toast.rejectedTitle'),
        body: t('toast.rejectedBody'),
      });
      return true;
    } catch (error) {
      showToast({ tone: 'danger', title: 'Échec du rejet', body: errorBody(error) });
      return false;
    }
  };

  // ── Colonnes TanStack Table
  const columns = useMemo<ColumnDef<AdminCorrectionView>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            aria-label="Tout sélectionner"
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Sélectionner la ligne"
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            // Empêche le click checkbox d'ouvrir le drawer
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        size: 32,
      },
      {
        accessorKey: 'nina',
        header: t('columns.nina'),
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'citizenName',
        header: 'Citoyen',
        cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'field',
        header: t('columns.field'),
        cell: ({ getValue }) => tField(getValue<string>() as never),
      },
      {
        accessorKey: 'currentValue',
        header: t('columns.before'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-fg-muted">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'proposedValue',
        header: t('columns.after'),
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'aiScore',
        header: t('columns.score'),
        cell: ({ row }) => {
          const score = row.original.aiScore;
          // Score absent = demande pas encore analysée par ai-service.
          if (score === null) {
            return <span className="font-mono text-sm text-fg-muted">—</span>;
          }
          const verdict = row.original.aiVerdict;
          const tone =
            verdict === 'HIGH'
              ? 'text-success-700'
              : verdict === 'MEDIUM'
                ? 'text-warning-700'
                : 'text-danger-700';
          return (
            <span className={cn('font-mono text-sm font-medium', tone)}>{Math.round(score)}</span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('columns.status'),
        cell: ({ getValue }) => <StatusBadge status={getValue<CorrectionStatus>()} />,
        filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
      },
      {
        accessorKey: 'region',
        header: 'Région',
        cell: ({ getValue }) => <span className="text-sm">{getValue<string>()}</span>,
        filterFn: (row, _id, value: string[]) => value.includes(row.original.region),
      },
      {
        accessorKey: 'submittedAt',
        header: t('columns.submittedAt'),
        cell: ({ getValue }) => (
          <span className="text-xs text-fg-muted">
            {format.dateTime(new Date(getValue<string>()), 'short')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Actions"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel>{t('columns.actions')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedId(row.original.id);
                  setDrawerOpen(true);
                }}
              >
                {t('actions.viewDetail')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void decideApprove(row.original.id)}
                disabled={row.original.status !== 'UNDER_REVIEW' || isDeciding}
              >
                {t('actions.approve')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedId(row.original.id);
                  setDrawerOpen(true);
                }}
                disabled={row.original.status !== 'UNDER_REVIEW'}
              >
                {t('actions.reject')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        size: 48,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tField, format, isDeciding],
  );

  // ── Table TanStack
  // TanStack Table renvoie des fonctions non-mémoïsables : le React Compiler
  // saute volontairement la mémoïsation de ce composant (comportement attendu,
  // sans impact UI ici car l'état est piloté par useState + TanStack Query).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: views,
    columns,
    state: { sorting, columnFilters, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const v = String(filterValue).toLowerCase().trim();
      if (!v) return true;
      return (
        row.original.nina.toLowerCase().includes(v) ||
        row.original.citizenName.toLowerCase().includes(v)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    getRowId: (row) => row.id,
  });

  const selectedCount = Object.keys(rowSelection).length;

  /** Approbation en lot — séquentielle, uniquement les lignes décidables. */
  const bulkApprove = async () => {
    const ids = Object.keys(rowSelection).filter(
      (id) => views.find((v) => v.id === id)?.status === 'UNDER_REVIEW',
    );
    setRowSelection({});
    if (ids.length === 0) return;
    setBulkBusy(true);
    let done = 0;
    let firstError: unknown = null;
    try {
      for (const id of ids) {
        try {
          await approve.mutateAsync(id);
          done += 1;
        } catch (error) {
          firstError = firstError ?? error;
        }
      }
    } finally {
      setBulkBusy(false);
    }
    if (firstError !== null) {
      showToast({ tone: 'danger', title: "Échec de l'approbation", body: errorBody(firstError) });
    } else {
      showToast({
        tone: 'success',
        title: t('toast.approvedTitle'),
        body: t('toast.bulkSuccess', { count: done }),
      });
    }
  };

  const selectedCorrection = views.find((c) => c.id === selectedId) ?? null;

  // ── Filters helpers
  const statusFilterValue = (columnFilters.find((f) => f.id === 'status')?.value as string[]) ?? [];
  const regionFilterValue = (columnFilters.find((f) => f.id === 'region')?.value as string[]) ?? [];
  const toggleStatusFilter = (s: CorrectionStatus) => {
    const current = statusFilterValue;
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    table.getColumn('status')?.setFilterValue(next.length ? next : undefined);
  };
  const toggleRegionFilter = (r: string) => {
    const current = regionFilterValue;
    const next = current.includes(r) ? current.filter((x) => x !== r) : [...current, r];
    table.getColumn('region')?.setFilterValue(next.length ? next : undefined);
  };
  const activeFilterCount = columnFilters.length + (globalFilter ? 1 : 0);

  // ── États chargement / erreur (rendus après les hooks — règle des hooks)
  if (corrections.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (corrections.isError) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-700"
          aria-hidden="true"
        >
          <AlertTriangle className="size-6" />
        </span>
        <p className="text-sm font-medium text-fg">Impossible de charger les corrections</p>
        <p className="max-w-sm text-sm text-fg-muted">{errorBody(corrections.error)}</p>
        <Button variant="outline" size="sm" onClick={() => void corrections.refetch()}>
          Réessayer
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar : recherche + filtres + actions en lot */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={t('filters.search')}
            className="flex h-10 w-full rounded-base border border-border bg-bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('filters.search')}
          />
        </div>

        {/* Filtre statut */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="md">
              {t('filters.status')}
              {statusFilterValue.length > 0 && (
                <span className="ml-2 rounded-full bg-primary px-1.5 text-xs text-primary-fg">
                  {statusFilterValue.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUS_FILTER.map((s) => (
              <DropdownMenuItem key={s} onClick={() => toggleStatusFilter(s)}>
                <Checkbox
                  checked={statusFilterValue.includes(s)}
                  className="mr-2"
                  onCheckedChange={() => {}}
                />
                {tStatus(s as never)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filtre région (options dérivées des NINA affichés) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="md">
              {t('filters.region')}
              {regionFilterValue.length > 0 && (
                <span className="ml-2 rounded-full bg-primary px-1.5 text-xs text-primary-fg">
                  {regionFilterValue.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {regions.map((r) => (
              <DropdownMenuItem key={r} onClick={() => toggleRegionFilter(r)}>
                <Checkbox
                  checked={regionFilterValue.includes(r)}
                  className="mr-2"
                  onCheckedChange={() => {}}
                />
                {r}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setColumnFilters([]);
              setGlobalFilter('');
            }}
          >
            <X className="size-4" aria-hidden="true" />
            {t('filters.reset')}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selectedCount > 0 && (
            <Button
              variant="solid"
              size="md"
              onClick={() => void bulkApprove()}
              disabled={isDeciding}
            >
              <Check className="size-4" aria-hidden="true" />
              {t('actions.bulkApprove', { count: selectedCount })}
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg-muted/40">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-fg-muted"
                        style={{ width: header.column.columnDef.size }}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          // Colonne triable → bouton header avec icône de tri.
                          <button
                            type="button"
                            className="flex items-center gap-1 cursor-pointer hover:text-fg"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ArrowUp className="size-3" aria-hidden="true" />,
                              desc: <ArrowDown className="size-3" aria-hidden="true" />,
                            }[header.column.getIsSorted() as string] ?? (
                              <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          // Colonne non-triable (ex: select, actions) → rendu direct
                          // pour ne pas imbriquer le <Checkbox> (qui est un <button>)
                          // dans un <button>, ce qui casse l'hydration React.
                          <span className="flex items-center">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-bg-muted text-fg-muted">
                        <SearchX className="size-6" aria-hidden="true" />
                      </span>
                      <p className="text-sm font-medium text-fg">{t('emptyTitle')}</p>
                      <p className="max-w-sm text-sm text-fg-muted">{t('emptyHint')}</p>
                      {activeFilterCount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1"
                          onClick={() => {
                            setColumnFilters([]);
                            setGlobalFilter('');
                          }}
                        >
                          <X className="size-4" aria-hidden="true" />
                          {t('filters.reset')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'cursor-pointer border-b border-border transition-colors',
                      'hover:bg-bg-muted/40',
                      row.getIsSelected() && 'bg-primary-50/40',
                    )}
                    onClick={() => {
                      setSelectedId(row.original.id);
                      setDrawerOpen(true);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm">
          <p className="text-xs text-fg-muted">
            {t('pagination.showing', {
              from:
                table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1,
              to: Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length,
              ),
              total: table.getFilteredRowModel().rows.length,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label={t('pagination.prev')}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-xs">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label={t('pagination.next')}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Toast post-décision (succès ou erreur) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'fixed bottom-6 right-6 z-50 max-w-sm rounded-base border px-4 py-3 text-sm shadow-lg',
            toast.tone === 'success'
              ? 'border-success/30 bg-success-50'
              : 'border-danger/30 bg-danger-50',
          )}
        >
          <p
            className={cn(
              'font-medium',
              toast.tone === 'success' ? 'text-success-700' : 'text-danger-700',
            )}
          >
            {toast.title}
          </p>
          <p
            className={cn(toast.tone === 'success' ? 'text-success-700/80' : 'text-danger-700/80')}
          >
            {toast.body}
          </p>
        </div>
      )}

      {/* Drawer détail */}
      <CorrectionDrawer
        correction={selectedCorrection}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onApprove={decideApprove}
        onReject={decideReject}
        isDeciding={isDeciding}
      />
    </div>
  );
}
