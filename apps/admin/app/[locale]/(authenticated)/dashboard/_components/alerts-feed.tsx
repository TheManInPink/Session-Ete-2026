/**
 * @file        alerts-feed.tsx
 * @description Feed scrollable d'alertes SIGAC. Les données initiales viennent
 *              du contrat `AdminDashboardStats.alerts` (@nina-aes/api-client),
 *              passées en prop par le server component AD-01.
 *
 *              La simulation d'arrivées (setInterval avec jitter 12-20 s) est
 *              STRICTEMENT réservée au mode `mock` (`useApiMode()`), pour les
 *              démos sans backend. En mode live, le feed n'affiche que les
 *              alertes du contrat — le flux temps réel (SSE anticorruption-
 *              service) reste à implémenter (Bloc D).
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useApiMode } from '@nina-aes/api-client/react';
import type { AlertEntry, AlertSeverity } from '@nina-aes/api-client';
import { Badge } from '@nina-aes/ui/components/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { AlertTriangle, ChevronRight, Radio } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';
import { generateNewAlert } from '../../../../../lib/dashboard/view-model';

const SEVERITY_TONES: Record<AlertSeverity, string> = {
  INFO: 'bg-bg-muted text-fg-muted',
  LOW: 'bg-info-50 text-info-700',
  MEDIUM: 'bg-warning-50 text-warning-700',
  HIGH: 'bg-warning-50 text-warning-800',
  CRITICAL: 'bg-danger-50 text-danger-700',
};

export function AlertsFeed({
  initialAlerts,
  locale,
  now,
  maxItems = 12,
}: {
  initialAlerts: readonly AlertEntry[];
  locale: string;
  /** Référence temporelle stable (ISO ou Date). Passée par le server pour
   *  éviter le hydration mismatch sur `format.relativeTime` qui sinon
   *  appellerait `new Date()` au render — différent server/client. */
  now: string;
  maxItems?: number;
}) {
  const t = useTranslations('admin.dashboard');
  const tSeverity = useTranslations('admin.sigac.severity');
  const tCategory = useTranslations('admin.sigac.category');
  const format = useFormatter();
  const apiMode = useApiMode();
  const [alerts, setAlerts] = useState<readonly AlertEntry[]>(initialAlerts);
  const counterRef = useRef(initialAlerts.length);
  const [pulse, setPulse] = useState(false);
  // Dernière alerte reçue — sert à l'annonce vocale (région aria-live).
  // On stocke l'objet brut et on traduit au rendu (hooks indisponibles en effet).
  const [announced, setAnnounced] = useState<AlertEntry | null>(null);

  /** Libellé sévérité — INFO n'a pas de clé `admin.sigac.severity.*`. */
  const severityLabel = (s: AlertSeverity): string => (s === 'INFO' ? 'Info' : tSeverity(s));

  useEffect(() => {
    // Simulation réservée au mode mock — jamais de fausses alertes en live.
    if (apiMode !== 'mock') return;
    // Jitter 12-20 s pour simuler un flux non régulier
    const schedule = () => {
      const delay = 12_000 + Math.random() * 8_000;
      return window.setTimeout(() => {
        counterRef.current += 1;
        const next = generateNewAlert(counterRef.current);
        setAlerts((prev) => [next, ...prev].slice(0, maxItems));
        setAnnounced(next);
        setPulse(true);
        window.setTimeout(() => setPulse(false), 800);
        handle.current = schedule();
      }, delay);
    };
    const handle = { current: schedule() };
    return () => {
      window.clearTimeout(handle.current);
    };
  }, [maxItems, apiMode]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t('alertsFeedTitle')}</CardTitle>
          <CardDescription>{t('alertsFeedLive')}</CardDescription>
        </div>
        <Badge
          className={cn(
            'flex items-center gap-1.5 bg-success-50 text-success-700 transition-all',
            pulse && 'animate-pulse bg-success-100',
          )}
        >
          <Radio className="size-3" aria-hidden="true" />
          LIVE
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-0">
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-muted">{t('alertsFeedEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id}>
                <a
                  href={`/${locale}/sigac?alert=${a.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bg-muted/40 focus-visible:bg-bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                      SEVERITY_TONES[a.severity],
                    )}
                    aria-hidden="true"
                  >
                    <AlertTriangle className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      <Badge className={cn('px-1.5 py-0 text-xs', SEVERITY_TONES[a.severity])}>
                        {severityLabel(a.severity)}
                      </Badge>
                      <span className="truncate text-xs text-fg-muted">
                        {tCategory(a.category)}
                      </span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm">{a.shortDescription}</p>
                    <p className="mt-1 text-xs text-fg-muted">
                      <time dateTime={a.receivedAt}>
                        {format.relativeTime(new Date(a.receivedAt), new Date(now))}
                      </time>
                      <span className="mx-1.5">·</span>
                      {a.location}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {/* Annonce vocale des nouvelles alertes (lecteurs d'écran uniquement). */}
      <p className="sr-only" role="status" aria-live="polite">
        {announced
          ? `${t('alertsFeedNew')} ${severityLabel(announced.severity)} : ${announced.shortDescription}`
          : ''}
      </p>
    </Card>
  );
}
