/**
 * @file        sigac-client.tsx
 * @description AD-03 client — multi-filtres (sévérité + période) + feed
 *              alertes filtrable. Le top agents + MaliHeatmap restent rendus
 *              côté serveur (statiques pour la session).
 *
 *              Mock SSE : 12-20s jitter, identique à AlertsFeed AD-01.
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@nina-aes/ui/components/card';
import { Checkbox } from '@nina-aes/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nina-aes/ui/components/dropdown-menu';
import { AlertTriangle, ChevronRight, Radio, Search, X } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import {
  generateNewAlert,
  type AlertEntry,
  type AlertSeverity,
} from '../../../../../lib/mock-dashboard';

const SEVERITY_OPTIONS: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const SEVERITY_TONES: Record<AlertSeverity, string> = {
  LOW: 'bg-info-50 text-info-700',
  MEDIUM: 'bg-warning-50 text-warning-700',
  HIGH: 'bg-warning-50 text-warning-800',
  CRITICAL: 'bg-danger-50 text-danger-700',
};

type Period = 'today' | 'week' | 'month';

const PERIOD_HOURS: Record<Period, number> = {
  today: 24,
  week: 24 * 7,
  month: 24 * 30,
};

export function SigacClient({
  initialAlerts,
  locale,
}: {
  initialAlerts: readonly AlertEntry[];
  locale: string;
}) {
  const t = useTranslations('admin.sigac');
  const tSeverity = useTranslations('admin.sigac.severity');
  const tCategory = useTranslations('admin.sigac.category');
  const format = useFormatter();

  const [alerts, setAlerts] = useState<readonly AlertEntry[]>(initialAlerts);
  const counterRef = useRef(initialAlerts.length);
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity[]>([]);
  const [period, setPeriod] = useState<Period>('week');
  const [search, setSearch] = useState('');
  const [pulse, setPulse] = useState(false);

  // ── Mock SSE
  useEffect(() => {
    const schedule = () => {
      const delay = 12_000 + Math.random() * 8_000;
      return window.setTimeout(() => {
        counterRef.current += 1;
        const next = generateNewAlert(counterRef.current);
        setAlerts((prev) => [next, ...prev].slice(0, 50));
        setPulse(true);
        window.setTimeout(() => setPulse(false), 800);
        handle.current = schedule();
      }, delay);
    };
    const handle = { current: schedule() };
    return () => window.clearTimeout(handle.current);
  }, []);

  // ── Filtrage
  const filtered = useMemo(() => {
    const cutoffMs = Date.now() - PERIOD_HOURS[period] * 60 * 60 * 1000;
    const s = search.trim().toLowerCase();
    return alerts.filter((a) => {
      if (new Date(a.receivedAt).getTime() < cutoffMs) return false;
      if (severityFilter.length > 0 && !severityFilter.includes(a.severity)) return false;
      if (s && !a.shortDescription.toLowerCase().includes(s) && !a.location.toLowerCase().includes(s))
        return false;
      return true;
    });
  }, [alerts, severityFilter, period, search]);

  const toggleSeverity = (s: AlertSeverity) => {
    setSeverityFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const activeFilters =
    severityFilter.length + (period !== 'week' ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* ── Toolbar filtres ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher description ou lieu…"
            className="flex h-10 w-full rounded-base border border-border bg-bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="md">
              {t('filters.severity')}
              {severityFilter.length > 0 && (
                <span className="ml-2 rounded-full bg-primary px-1.5 text-xs text-primary-fg">
                  {severityFilter.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SEVERITY_OPTIONS.map((s) => (
              <DropdownMenuItem key={s} onClick={() => toggleSeverity(s)}>
                <Checkbox
                  checked={severityFilter.includes(s)}
                  className="mr-2"
                  onCheckedChange={() => {}}
                />
                {tSeverity(s)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="md">
              {t('filters.period')} ·{' '}
              {period === 'today'
                ? t('filters.periodToday')
                : period === 'week'
                  ? t('filters.periodWeek')
                  : t('filters.periodMonth')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(['today', 'week', 'month'] as const).map((p) => (
              <DropdownMenuItem key={p} onClick={() => setPeriod(p)}>
                {p === 'today'
                  ? t('filters.periodToday')
                  : p === 'week'
                    ? t('filters.periodWeek')
                    : t('filters.periodMonth')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilters > 0 && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setSeverityFilter([]);
              setPeriod('week');
              setSearch('');
            }}
          >
            <X className="size-4" aria-hidden="true" />
            {t('filters.reset')}
          </Button>
        )}

        <div className="ml-auto">
          <Badge
            className={cn(
              'flex items-center gap-1.5 bg-success-50 text-success-700 transition-all',
              pulse && 'animate-pulse bg-success-100',
            )}
          >
            <Radio className="size-3" aria-hidden="true" />
            {t('feed.live')}
          </Badge>
        </div>
      </div>

      {/* ── Feed alertes filtré ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('feed.title')}</CardTitle>
          <CardDescription>
            {filtered.length} / {alerts.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-fg-muted">{t('feed.empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((a) => (
                <li key={a.id}>
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-bg-muted/40">
                    <span
                      className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', SEVERITY_TONES[a.severity])}
                      aria-hidden="true"
                    >
                      <AlertTriangle className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <Badge className={cn('px-1.5 py-0 text-xs', SEVERITY_TONES[a.severity])}>
                          {tSeverity(a.severity)}
                        </Badge>
                        <span className="text-xs text-fg-muted">{tCategory(a.category)}</span>
                      </p>
                      <p className="mt-1 text-sm">{a.shortDescription}</p>
                      <p className="mt-1 text-xs text-fg-muted">
                        <time dateTime={a.receivedAt}>{format.relativeTime(new Date(a.receivedAt))}</time>
                        <span className="mx-1.5">·</span>
                        {a.location}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={`/${locale}/sigac/${a.id}`}>
                        {t('feed.investigate')}
                        <ChevronRight className="size-3" aria-hidden="true" />
                      </a>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
