/**
 * @file        corrections-client.tsx
 * @description Client component orchestrant le DataGrid AD-02 :
 *              - TanStack Table 8 (sort, sélection multiple, pagination)
 *              - Filtres : recherche full-text NINA/nom, statut, région
 *              - Drawer détail (CorrectionDrawer)
 *              - Actions individuelles + en lot (mock pour Session 3)
 *
 *              Le data set vient en prop (généré côté serveur via
 *              `MOCK_CORRECTIONS`). En Session 4+, ce composant fera un
 *              fetch via `api.correction.listForAgent({ ... })`.
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useMemo, useState, useTransition } from 'react';
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
import { Button } from '@nina-aes/ui/components/button';
import { Card } from '@nina-aes/ui/components/card';
import { Checkbox } from '@nina-aes/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nina-aes/ui/components/dropdown-menu';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import type { AdminCorrection, AdminCorrectionStatus } from '../../../../../lib/mock-corrections';
import { CorrectionDrawer } from './correction-drawer';
import { StatusBadge } from './status-badge';

const STATUS_FILTER: AdminCorrectionStatus[] = [
  'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'AWAITING_DOCUMENT',
];
const REGION_FILTER = ['Bamako', 'Sikasso', 'Kayes', 'Mopti'] as const;
type RegionFilter = (typeof REGION_FILTER)[number];

export function CorrectionsClient({ initialData }: { initialData: AdminCorrection[] }) {
  const t = useTranslations('admin.corrections');
  const tField = useTranslations('admin.corrections.field');
  const tStatus = useTranslations('admin.corrections.status');
  const format = useFormatter();

  // ── État local — en Session 4+ : remplacer `data` par useQuery
  const [data, setData] = useState<AdminCorrection[]>(initialData);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'submittedAt', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  // ── Colonnes TanStack Table
  const columns = useMemo<ColumnDef<AdminCorrection>[]>(
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
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string>()}</span>
        ),
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
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'aiScore',
        header: t('columns.score'),
        cell: ({ row }) => {
          const score = row.original.aiScore;
          const verdict = row.original.aiVerdict;
          const tone =
            verdict === 'HIGH'
              ? 'text-success-700'
              : verdict === 'MEDIUM'
                ? 'text-warning-700'
                : 'text-danger-700';
          return (
            <span className={cn('font-mono text-sm font-medium', tone)}>{score}</span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('columns.status'),
        cell: ({ getValue }) => <StatusBadge status={getValue<AdminCorrectionStatus>()} />,
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
                onClick={() => decide(row.original.id, 'APPROVED')}
                disabled={row.original.status === 'APPROVED' || row.original.status === 'REJECTED'}
              >
                {t('actions.approve')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedId(row.original.id);
                  setDrawerOpen(true);
                }}
                disabled={row.original.status === 'APPROVED' || row.original.status === 'REJECTED'}
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
    [t, tField, format],
  );

  // ── Table TanStack
  const table = useReactTable({
    data,
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

  // ── Décision mock (Session 3) — Session 4+ : mutation api.correction.decide
  const decide = (id: string, decision: 'APPROVED' | 'REJECTED', _reason?: string) => {
    startTransition(() => {
      setData((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: decision,
                timeline: [
                  ...c.timeline,
                  {
                    at: new Date().toISOString(),
                    kind: decision,
                    actor: 'Modibo Konaté',
                    note: _reason,
                  },
                ],
              }
            : c,
        ),
      );
      setToast({
        title: decision === 'APPROVED' ? t('toast.approvedTitle') : t('toast.rejectedTitle'),
        body: decision === 'APPROVED' ? t('toast.approvedBody') : t('toast.rejectedBody'),
      });
      setTimeout(() => setToast(null), 4_000);
    });
  };

  const selectedCount = Object.keys(rowSelection).length;
  const bulkApprove = () => {
    Object.keys(rowSelection).forEach((id) => decide(id, 'APPROVED'));
    setRowSelection({});
  };

  const selectedCorrection = data.find((c) => c.id === selectedId) ?? null;

  // ── Filters helpers
  const statusFilterValue = (columnFilters.find((f) => f.id === 'status')?.value as string[]) ?? [];
  const regionFilterValue = (columnFilters.find((f) => f.id === 'region')?.value as string[]) ?? [];
  const toggleStatusFilter = (s: AdminCorrectionStatus) => {
    const current = statusFilterValue;
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    table.getColumn('status')?.setFilterValue(next.length ? next : undefined);
  };
  const toggleRegionFilter = (r: RegionFilter) => {
    const current = regionFilterValue;
    const next = current.includes(r) ? current.filter((x) => x !== r) : [...current, r];
    table.getColumn('region')?.setFilterValue(next.length ? next : undefined);
  };
  const activeFilterCount = columnFilters.length + (globalFilter ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Toolbar : recherche + filtres + actions en lot */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
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

        {/* Filtre région */}
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
            {REGION_FILTER.map((r) => (
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
            <Button variant="solid" size="md" onClick={bulkApprove} disabled={isPending}>
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
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            className={cn(
                              'flex items-center gap-1',
                              canSort && 'cursor-pointer hover:text-fg',
                            )}
                            disabled={!canSort}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort &&
                              ({
                                asc: <ArrowUp className="size-3" aria-hidden="true" />,
                                desc: <ArrowDown className="size-3" aria-hidden="true" />,
                              }[header.column.getIsSorted() as string] ?? (
                                <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />
                              ))}
                          </button>
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
                  <td
                    colSpan={columns.length}
                    className="px-3 py-10 text-center text-sm text-fg-muted"
                  >
                    {t('empty')}
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
              from: table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1,
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

      {/* Toast post-décision */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-base border border-success/30 bg-success-50 px-4 py-3 text-sm shadow-lg"
        >
          <p className="font-medium text-success-700">{toast.title}</p>
          <p className="text-success-700/80">{toast.body}</p>
        </div>
      )}

      {/* Drawer détail */}
      <CorrectionDrawer
        correction={selectedCorrection}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onDecision={decide}
      />
    </div>
  );
}
