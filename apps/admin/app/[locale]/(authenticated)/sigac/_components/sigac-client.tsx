/**
 * @file        sigac-client.tsx
 * @description AD-03 client — file procureur des signalements scellés,
 *              branchée sur `useWhistleblowerQueue` (@nina-aes/api-client/react,
 *              endpoint authentifié INSPECTOR / PROSECUTOR).
 *
 *              PROTOCOLE ANTI-CORRÉLATION (§6) : la file n'expose AUCUN contenu
 *              déchiffrable — uniquement des buckets grossiers (classification,
 *              sévérité 2 niveaux), le JOUR de réception (jamais l'heure), le
 *              statut d'instruction et les métadonnées de scellement. Le
 *              déchiffrement se fait hors-ligne par le procureur. L'écran
 *              reflète strictement ces champs, rien d'inventé.
 *
 * @module      @nina-aes/admin
 */

'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWhistleblowerQueue } from '@nina-aes/api-client/react';
import type {
  WhistleblowerClassificationBucket,
  WhistleblowerQueueItem,
  WhistleblowerSeverityBucket,
  WhistleblowerStatus,
} from '@nina-aes/api-client';
import { Badge } from '@nina-aes/ui/components/badge';
import { Button } from '@nina-aes/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nina-aes/ui/components/card';
import { Checkbox } from '@nina-aes/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nina-aes/ui/components/dropdown-menu';
import { Skeleton } from '@nina-aes/ui/components/skeleton';
import { AlertTriangle, Lock, X } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';

// ── Libellés FR des buckets / statuts (pas de clé i18n dédiée à ce jour) ────

const CLASSIFICATION_LABELS: Record<WhistleblowerClassificationBucket, string> = {
  FINANCIAL_OR_POWER: 'Finances / abus de pouvoir',
  FRAUD_OR_LEAK: 'Fraude / fuite',
  OTHER_BUCKET: 'Autre',
};

const SEVERITY_BUCKET_LABELS: Record<WhistleblowerSeverityBucket, string> = {
  LOW_MED: 'Faible / moyenne',
  HIGH_CRIT: 'Élevée / critique',
};

const SEVERITY_BUCKET_TONES: Record<WhistleblowerSeverityBucket, string> = {
  LOW_MED: 'bg-warning-50 text-warning-700',
  HIGH_CRIT: 'bg-danger-50 text-danger-700',
};

const STATUS_LABELS: Record<WhistleblowerStatus, string> = {
  RECEIVED: 'Reçu',
  ACKNOWLEDGED: 'Accusé de réception',
  UNDER_INVESTIGATION: 'En instruction',
  CLOSED_FOUNDED: 'Clos — fondé',
  CLOSED_UNFOUNDED: 'Clos — non fondé',
  CLOSED_DUPLICATE: 'Clos — doublon',
};

const STATUS_TONES: Record<WhistleblowerStatus, string> = {
  RECEIVED: 'bg-info-50 text-info-700',
  ACKNOWLEDGED: 'bg-info-50 text-info-700',
  UNDER_INVESTIGATION: 'bg-warning-50 text-warning-700',
  CLOSED_FOUNDED: 'bg-success-50 text-success-700',
  CLOSED_UNFOUNDED: 'bg-bg-muted text-fg-muted',
  CLOSED_DUPLICATE: 'bg-bg-muted text-fg-muted',
};

/** Libellé court du schéma de scellement (jamais Ed25519 — signature ≠ chiffrement). */
const SCHEME_LABELS: Record<WhistleblowerQueueItem['scheme'], string> = {
  SEALED_BOX_X25519: 'Boîte scellée X25519',
  RSA_OAEP_4096: 'RSA-OAEP-4096',
};

const SEVERITY_OPTIONS: WhistleblowerSeverityBucket[] = ['HIGH_CRIT', 'LOW_MED'];
const CLASSIFICATION_OPTIONS: WhistleblowerClassificationBucket[] = [
  'FINANCIAL_OR_POWER',
  'FRAUD_OR_LEAK',
  'OTHER_BUCKET',
];

export function SigacClient() {
  const t = useTranslations('admin.sigac');
  const queue = useWhistleblowerQueue();

  const [severityFilter, setSeverityFilter] = useState<WhistleblowerSeverityBucket[]>([]);
  const [classificationFilter, setClassificationFilter] = useState<
    WhistleblowerClassificationBucket[]
  >([]);

  // Tri stable : jour de réception décroissant, départage par id (déterministe).
  const reports = useMemo(() => {
    const items = [...(queue.data?.reports ?? [])];
    return items.sort((a, b) =>
      a.received_day !== b.received_day
        ? a.received_day < b.received_day
          ? 1
          : -1
        : a.id.localeCompare(b.id),
    );
  }, [queue.data]);

  const filtered = useMemo(
    () =>
      reports.filter(
        (r) =>
          (severityFilter.length === 0 || severityFilter.includes(r.severity_bucket)) &&
          (classificationFilter.length === 0 ||
            classificationFilter.includes(r.classification_bucket)),
      ),
    [reports, severityFilter, classificationFilter],
  );

  const toggleSeverity = (s: WhistleblowerSeverityBucket) => {
    setSeverityFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };
  const toggleClassification = (c: WhistleblowerClassificationBucket) => {
    setClassificationFilter((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };
  const activeFilters = severityFilter.length + classificationFilter.length;

  if (queue.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (queue.isError) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-700"
          aria-hidden="true"
        >
          <AlertTriangle className="size-6" />
        </span>
        <p className="text-sm font-medium text-fg">Impossible de charger la file procureur</p>
        <p className="max-w-sm text-sm text-fg-muted">
          {queue.error instanceof Error && queue.error.message
            ? queue.error.message
            : 'Réessayez ou contactez le support.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => void queue.refetch()}>
          Réessayer
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar filtres (buckets uniquement — aucun texte à chercher) ── */}
      <div className="flex flex-wrap items-center gap-2">
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
                {SEVERITY_BUCKET_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="md">
              Classification
              {classificationFilter.length > 0 && (
                <span className="ml-2 rounded-full bg-primary px-1.5 text-xs text-primary-fg">
                  {classificationFilter.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {CLASSIFICATION_OPTIONS.map((c) => (
              <DropdownMenuItem key={c} onClick={() => toggleClassification(c)}>
                <Checkbox
                  checked={classificationFilter.includes(c)}
                  className="mr-2"
                  onCheckedChange={() => {}}
                />
                {CLASSIFICATION_LABELS[c]}
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
              setClassificationFilter([]);
            }}
          >
            <X className="size-4" aria-hidden="true" />
            {t('filters.reset')}
          </Button>
        )}
      </div>

      {/* ── File des signalements scellés ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>File des signalements scellés</CardTitle>
          <CardDescription>
            {filtered.length} / {queue.data?.count ?? reports.length} — buckets grossiers et jour de
            réception uniquement (anti-corrélation) ; contenu chiffré, déchiffrement hors-ligne par
            le procureur.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-fg-muted">
              Aucun signalement ne correspond aux filtres.
            </p>
          ) : (
            <ul className="divide-y divide-border" aria-label="Signalements scellés">
              {filtered.map((r) => (
                <li key={r.id}>
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-bg-muted/40">
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                        SEVERITY_BUCKET_TONES[r.severity_bucket],
                      )}
                      aria-hidden="true"
                    >
                      <Lock className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge
                          className={cn(
                            'px-1.5 py-0 text-xs',
                            SEVERITY_BUCKET_TONES[r.severity_bucket],
                          )}
                        >
                          {SEVERITY_BUCKET_LABELS[r.severity_bucket]}
                        </Badge>
                        <Badge className={cn('px-1.5 py-0 text-xs', STATUS_TONES[r.status])}>
                          {STATUS_LABELS[r.status]}
                        </Badge>
                        <span className="text-xs text-fg-muted">
                          {CLASSIFICATION_LABELS[r.classification_bucket]}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-fg-muted">
                        Reçu le{' '}
                        <time dateTime={r.received_day} className="font-mono">
                          {r.received_day}
                        </time>
                        <span className="mx-1.5">·</span>
                        {SCHEME_LABELS[r.scheme]}
                        <span className="mx-1.5">·</span>
                        clé <span className="font-mono">{r.cipher_kid}</span>
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-fg-muted/70">{r.id}</p>
                    </div>
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
