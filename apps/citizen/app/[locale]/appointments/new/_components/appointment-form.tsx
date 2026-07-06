/**
 * @file        appointment-form.tsx
 * @description Formulaire de prise de RDV — sélection d'un créneau disponible
 *              (groupés par jour) + motif, suivi d'une modale de confirmation
 *              avec récapitulatif et QR code de rendez-vous.
 *
 *              Les créneaux proviennent de `useAvailableSlots` (mock → fixtures,
 *              live → appointment-service via le BFF). Chaque créneau porte son
 *              centre (la file prioritaire éventuelle est décidée côté serveur
 *              selon la vulnérabilité). La création passe par
 *              `useCreateAppointment`. Le QR signé réel sera émis par
 *              `document-service` (cf. doc 10) — ici un aperçu décoratif.
 * @module      @nina-aes/citizen
 */

'use client';

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatNina } from '@nina-aes/utils';
import { useAvailableSlots, useCreateAppointment } from '@nina-aes/api-client/react';
import type { Slot } from '@nina-aes/api-client';
import { Button } from '@nina-aes/ui/components/button';
import { Label } from '@nina-aes/ui/components/label';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Badge } from '@nina-aes/ui/components/badge';
import { Skeleton } from '@nina-aes/ui/components/skeleton';
import { Calendar, MapPin, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';

/** Hash déterministe (FNV-1a) d'une chaîne → entier non signé 32 bits. */
function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * QR code DÉCORATIF déterministe (aperçu démo, non scannable).
 * Le QR signé réel (JWT RS256) sera produit par `document-service`.
 */
function DemoQrCode({ value, size = 132 }: { value: string; size?: number }) {
  const N = 25;
  let state = hashString(value) || 1;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };

  const FINDER_BOXES: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [0, N - 7],
    [N - 7, 0],
  ];
  const inFinder = (r: number, c: number) =>
    FINDER_BOXES.some(([br, bc]) => r >= br && r < br + 7 && c >= bc && c < bc + 7);
  const finderOn = (r: number, c: number) => {
    const box = FINDER_BOXES.find(([br, bc]) => r >= br && r < br + 7 && c >= bc && c < bc + 7);
    if (!box) return false;
    const lr = r - box[0];
    const lc = c - box[1];
    const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
    const center = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
    return ring || center;
  };

  const cells: string[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const on = inFinder(r, c) ? finderOn(r, c) : rand() > 0.55;
      if (on) cells.push(`M${c} ${r}h1v1h-1z`);
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${N} ${N}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Aperçu de QR code de rendez-vous"
      className="rounded-base border border-border bg-white"
    >
      <path d={cells.join(' ')} fill="#1B3A5C" />
    </svg>
  );
}

interface AppointmentFormProps {
  locale: string;
  nina: string;
}

interface Confirmation {
  centerName: string;
  dateLabel: string;
  time: string;
  queue: number;
  reference: string;
}

/** Clé stable d'un créneau (centre + horodatage). */
const slotKey = (s: Slot) => `${s.centerId}|${s.startsAt}`;
/** Date `YYYY-MM-DD` locale d'un `Date`. */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function AppointmentForm({ locale, nina }: AppointmentFormProps) {
  const t = useTranslations('appointments');
  const router = useRouter();

  // Plage de recherche : aujourd'hui → +7 jours (calcul client, hors render serveur).
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + 7);
    return { fromDate: isoDay(now), toDate: isoDay(to) };
  }, []);

  const slotsQuery = useAvailableSlots({ fromDate, toDate });
  const createAppointment = useCreateAppointment();

  const [selectedKey, setSelectedKey] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(() => slotsQuery.data?.slots ?? [], [slotsQuery.data]);
  const selectedSlot = slots.find((s) => slotKey(s) === selectedKey) ?? null;

  /** Créneaux regroupés par jour. */
  const slotsByDay = useMemo(() => {
    return slots.reduce<Record<string, Slot[]>>((acc, s) => {
      const day = s.startsAt.slice(0, 10);
      (acc[day] ??= []).push(s);
      return acc;
    }, {});
  }, [slots]);

  const canSubmit =
    selectedSlot !== null && reason.trim().length >= 5 && !createAppointment.isPending;

  const finish = () => router.push(`/${locale}/dashboard?appointment=1`);

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const dayLabel = (day: string) =>
    new Date(day).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  // Fermeture de la modale au clavier (Échap) + focus à l'ouverture.
  useEffect(() => {
    if (!confirmation) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmation]);

  const handleSubmit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    setError(null);
    try {
      const appt = await createAppointment.mutateAsync({
        centerId: selectedSlot.centerId,
        scheduledAt: selectedSlot.startsAt,
        reason: reason.trim(),
      });
      setConfirmation({
        centerName: appt.centerName,
        dateLabel: dayLabel(appt.scheduledAt.slice(0, 10)),
        time: timeOf(appt.scheduledAt),
        queue: appt.queueNumber,
        reference: `RDV-${appt.id.slice(0, 8).toUpperCase()}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.error'));
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sélection du créneau (chaque créneau porte son centre) */}
        <fieldset>
          <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Calendar className="size-4" aria-hidden="true" />
            {t('form.slot')}
          </legend>

          {slotsQuery.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : slotsQuery.isError ? (
            <Alert variant="danger">
              <AlertTitle>{t('form.error')}</AlertTitle>
              <AlertDescription>
                {slotsQuery.error instanceof Error ? slotsQuery.error.message : ''}
              </AlertDescription>
            </Alert>
          ) : slots.length === 0 ? (
            <Alert>
              <AlertDescription>{t('form.noSlots')}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {Object.entries(slotsByDay).map(([day, daySlots]) => (
                <div key={day}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    {dayLabel(day)}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {daySlots.map((s) => {
                      const key = slotKey(s);
                      return (
                        <label
                          key={key}
                          className={cn(
                            'flex cursor-pointer items-center justify-between gap-2 rounded-base border p-3 text-sm transition-colors',
                            'hover:border-primary hover:bg-primary-50/30',
                            selectedKey === key ? 'border-primary bg-primary-50' : 'border-border',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="slot"
                              value={key}
                              checked={selectedKey === key}
                              onChange={() => setSelectedKey(key)}
                              className="size-4 accent-primary"
                              aria-label={`${dayLabel(day)} ${timeOf(s.startsAt)} — ${s.centerName}`}
                            />
                            <span className="font-mono font-medium">{timeOf(s.startsAt)}</span>
                            <span className="flex items-center gap-1 text-xs text-fg-muted">
                              <MapPin className="size-3" aria-hidden="true" />
                              {s.centerName}
                            </span>
                          </span>
                          {s.priority !== 'P3' && (
                            <Badge className="bg-success-50 px-1.5 py-0 text-xs text-success-700">
                              {s.priority}
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        {/* Motif */}
        <div>
          <Label htmlFor="reason">{t('form.reason')}</Label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            minLength={5}
            maxLength={500}
            required
            placeholder={t('form.reasonPlaceholder')}
            className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {error && (
          <Alert variant="danger">
            <AlertTitle>{t('form.error')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={!canSubmit} className="w-full" size="lg">
          {createAppointment.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          {t('form.submit')}
        </Button>
      </form>

      {/* Modale de confirmation + QR de rendez-vous */}
      {confirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={finish}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="w-full max-w-md rounded-xl border border-border bg-bg-card p-6 shadow-xl focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <CheckCircle2 className="size-7 text-success-700" aria-hidden="true" />
              <div>
                <h2 id="confirm-title" className="text-lg font-semibold">
                  {t('confirm.title')}
                </h2>
                <p className="text-sm text-fg-muted">{t('confirm.subtitle')}</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 py-2">
              <DemoQrCode value={confirmation.reference} />
              <p className="text-xs font-medium">{t('confirm.qrCaption')}</p>
              <p className="text-center text-[11px] text-fg-muted">{t('confirm.qrNote')}</p>
            </div>

            <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-fg-muted">{t('confirm.center')}</dt>
              <dd className="font-medium">{confirmation.centerName}</dd>
              <dt className="text-fg-muted">{t('confirm.date')}</dt>
              <dd className="font-medium capitalize">{confirmation.dateLabel}</dd>
              <dt className="text-fg-muted">{t('confirm.slot')}</dt>
              <dd className="font-mono font-medium">{confirmation.time}</dd>
              <dt className="text-fg-muted">{t('confirm.queue')}</dt>
              <dd className="font-medium">#{confirmation.queue}</dd>
              <dt className="text-fg-muted">{t('confirm.reference')}</dt>
              <dd className="font-mono">{confirmation.reference}</dd>
              {nina && (
                <>
                  <dt className="text-fg-muted">{t('confirm.nina')}</dt>
                  <dd className="font-mono">{formatNina(nina)}</dd>
                </>
              )}
            </dl>

            <Button onClick={finish} className="mt-6 w-full" size="lg">
              {t('confirm.done')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
