/**
 * @file        appointment-form.tsx
 * @description Formulaire de prise de RDV en 2 colonnes :
 *              — GAUCHE : choix du centre (Select région → Select centre dépendant,
 *                alimentés par les 6 centres réels — CTDEC Bamako + antennes RAVEC),
 *                fiche centre, encadré file prioritaire / déroulement, « à apporter ».
 *              — DROITE : `Calendar` mensuel (jours sans créneau / week-ends / passé
 *                grisés), grille horaire (nature PRIORITAIRE 07:30–09:00 + STANDARD,
 *                via `PrioritySlot`), puis récap + motif + engagement pièce d'identité.
 *
 *              Les centres viennent de `useCenters`, les disponibilités de
 *              `useCenterAvailability` (mock → fixtures déterministes mirrorant le
 *              seed ; live → appointment-service `GET /centers/:id/availability` via
 *              le BFF). Les créneaux portent leur nature (STANDARD/PRIORITAIRE) et
 *              leurs places restantes RÉELLES — pas de numéro de file ni de niveau
 *              P1/P2/P3 à ce stade (décidés à la réservation / au check-in).
 *
 *              La RÉSERVATION citoyen passe désormais par le self-service
 *              `POST /appointments/me` (identité dérivée du NINA du token côté
 *              serveur ; ADR-028 intact — cf. `@nina-aes/api-client`). L'émetteur
 *              de token web (Keycloak) ↔ backend (auth-service) est réconcilié via
 *              l'échange SSO dual-token (ADR-036), validé bout-en-bout : le parcours
 *              de réservation est actif en **live** comme en **démo (mock)**. La
 *              confirmation ouvre une modale (`.ics` réel) ; le QR décoratif reste
 *              réservé au démo (le QR signé viendra de document-service).
 * @module      @nina-aes/citizen
 */

'use client';

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatNina } from '@nina-aes/utils';
import {
  useCenters,
  useCenterAvailability,
  useCreateAppointment,
} from '@nina-aes/api-client/react';
import type { AvailabilitySlot, CenterSummary } from '@nina-aes/api-client';
import { Button } from '@nina-aes/ui/components/button';
import { Label } from '@nina-aes/ui/components/label';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Checkbox } from '@nina-aes/ui/components/checkbox';
import { Skeleton } from '@nina-aes/ui/components/skeleton';
import { Calendar } from '@nina-aes/ui/components/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nina-aes/ui/components/select';
import { PrioritySlot } from '@nina-aes/ui/components/business/priority-slot';
import {
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Info,
  Loader2,
  MapPin,
  PackageCheck,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { isMockMode } from '../../../../../lib/api/config';

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
  /** Citoyen identifié comme vulnérable → file prioritaire (décidée serveur). */
  isVulnerable?: boolean;
}

interface Confirmation {
  centerName: string;
  dateLabel: string;
  time: string;
  /** Horodatage ISO du créneau — sert à l'export .ics. */
  startsAt: string;
  /** Numéro de passage — `null` à la réservation (assigné au check-in au centre). */
  queue: number | null;
  reference: string;
}

/** Date `YYYY-MM-DD` en composantes LOCALES (cohérent avec le calendrier ; Mali = UTC+0). */
const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function AppointmentForm({ locale, nina, isVulnerable = false }: AppointmentFormProps) {
  const t = useTranslations('appointments');
  const router = useRouter();
  // `mockMode` ne conditionne PLUS l'affichage du bouton de réservation (l'échange
  // SSO dual-token — ADR-036 — est réconcilié et validé) : le parcours est joué en
  // live comme en démo. Il ne distingue plus que le QR de confirmation (décoratif en
  // démo, absent en live tant que document-service n'émet pas le QR signé).
  const mockMode = isMockMode();

  // Fenêtre de recherche : aujourd'hui → +30 jours. Bornée à l'horizon de
  // réservation du backend (`APPOINTMENT_BOOKING_HORIZON_DAYS`, 30 j par défaut) :
  // au-delà, `GET /centers/:id/availability` renvoie 400.
  const { fromDate, toDate, windowMin, windowMax } = useMemo(() => {
    const now = new Date();
    const min = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const max = new Date(min);
    max.setDate(max.getDate() + 30);
    return { fromDate: localIso(min), toDate: localIso(max), windowMin: min, windowMax: max };
  }, []);

  const centersQuery = useCenters();
  const centers = useMemo(() => centersQuery.data ?? [], [centersQuery.data]);

  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedCenterId, setSelectedCenterId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [pledge, setPledge] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  /** Régions distinctes ayant au moins un centre (triées). */
  const regions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const c of centers) {
      if (!c.regionCode) continue; // centre sans région dérivable → non listable
      byCode.set(c.regionCode, c.regionName ?? c.regionCode);
    }
    return [...byCode.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [centers, locale]);

  const centersInRegion = useMemo(
    () => centers.filter((c) => c.regionCode === selectedRegion),
    [centers, selectedRegion],
  );
  // Centre effectivement retenu pour charger les disponibilités : la sélection
  // explicite, ou — si la région n'a qu'un seul centre — ce centre unique.
  // DÉRIVÉ au rendu (et non posé via un effet ni calculé dans le seul handler
  // `onRegionChange`, qui peut capturer un `centers` obsolète et laisser la
  // sélection vide → disponibilités jamais chargées, calendrier jamais affiché
  // pour toute région mono-centre, ex. Bamako).
  const effectiveCenterId =
    selectedCenterId || (centersInRegion.length === 1 ? (centersInRegion[0]?.id ?? '') : '');
  const selectedCenter: CenterSummary | null =
    centers.find((c) => c.id === effectiveCenterId) ?? null;

  const availability = useCenterAvailability(
    { centerId: effectiveCenterId, fromDate, toDate },
    { enabled: effectiveCenterId.length > 0 },
  );
  const days = useMemo(() => availability.data?.days ?? [], [availability.data]);

  /** Jours (YYYY-MM-DD) ouverts ayant au moins un créneau avec place restante. */
  const availableDays = useMemo(
    () =>
      new Set(
        days.filter((d) => d.open && d.slots.some((s) => s.remaining > 0)).map((d) => d.date),
      ),
    [days],
  );

  /** Créneaux réservables du jour sélectionné (place restante > 0). */
  const daySlots = useMemo(() => {
    if (!selectedDay) return [];
    const key = localIso(selectedDay);
    const day = days.find((d) => d.date === key);
    return (day?.slots ?? []).filter((s) => s.remaining > 0);
  }, [days, selectedDay]);

  const prioritySlots = daySlots.filter((s) => s.kind === 'PRIORITY');
  const standardSlots = daySlots.filter((s) => s.kind === 'STANDARD');
  const selectedSlot = daySlots.find((s) => s.start === selectedKey) ?? null;

  const createAppointment = useCreateAppointment();
  const canSubmit =
    selectedSlot !== null && reason.trim().length >= 5 && pledge && !createAppointment.isPending;

  const finish = () => router.push(`/${locale}/dashboard?appointment=1`);

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  // ── Sélections en cascade (réinitialisent l'aval) ─────────────────────────
  const onRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedDay(null);
    setSelectedKey('');
    // Réinitialise la sélection explicite ; l'auto-sélection d'une région
    // mono-centre est DÉRIVÉE au rendu (`effectiveCenterId`), donc robuste au
    // chargement asynchrone de `centers` (contrairement à un calcul ici).
    setSelectedCenterId('');
  };
  const onCenterChange = (id: string) => {
    setSelectedCenterId(id);
    setSelectedDay(null);
    setSelectedKey('');
  };
  const onDaySelect = (d: Date) => {
    setSelectedDay(d);
    setSelectedKey('');
  };

  /** Construit un événement iCalendar (RFC 5545) à partir du RDV confirmé. */
  const buildIcs = (c: Confirmation): string => {
    const esc = (s: string) =>
      s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const toUtc = (iso: string) =>
      new Date(iso)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    const start = toUtc(c.startsAt);
    const end = toUtc(new Date(new Date(c.startsAt).getTime() + 30 * 60_000).toISOString());
    const stamp = toUtc(new Date().toISOString());
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NINA-AES//RDV//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${c.reference}@nina-aes`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${esc(t('confirm.icsSummary', { center: c.centerName }))}`,
      `LOCATION:${esc(c.centerName)}`,
      `DESCRIPTION:${esc(t('confirm.icsDescription', { reference: c.reference }))}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(t('confirm.icsReminder'))}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  };

  /** Télécharge le RDV confirmé au format .ics (client-only, aucune requête). */
  const downloadIcs = (c: Confirmation) => {
    const blob = new Blob([buildIcs(c)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.reference}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
        centerId: effectiveCenterId,
        slot: selectedSlot.start,
        reason: reason.trim(),
      });
      setConfirmation({
        centerName: appt.centerName,
        dateLabel: dayLabel(appt.scheduledAt.slice(0, 10)),
        time: timeOf(appt.scheduledAt),
        startsAt: appt.scheduledAt,
        queue: appt.queueNumber,
        reference: `RDV-${appt.id.slice(0, 8).toUpperCase()}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.error'));
    }
  };

  const renderSlot = (s: AvailabilitySlot) => {
    const isPriority = s.kind === 'PRIORITY';
    return (
      <PrioritySlot
        key={s.start}
        time={timeOf(s.start)}
        // La barre de couleur n'est qu'un accent visuel de la fenêtre prioritaire ;
        // le niveau P1/P2/P3 d'un RDV n'est décidé qu'à la réservation.
        priority={isPriority ? 'P2' : 'P3'}
        badge={isPriority ? t('slots.priorityBadge') : t('slots.standardBadge')}
        label={t('slots.remaining', { count: s.remaining })}
        state={selectedKey === s.start ? 'selected' : 'available'}
        onClick={() => setSelectedKey(s.start)}
        aria-label={`${timeOf(s.start)} — ${selectedCenter?.name ?? ''}`}
      />
    );
  };

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* ── Colonne GAUCHE : choix du centre ─────────────────────────── */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="size-4" aria-hidden="true" />
              {t('select.title')}
            </h2>

            {centersQuery.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : centersQuery.isError ? (
              <Alert variant="danger">
                <AlertDescription>{t('form.error')}</AlertDescription>
              </Alert>
            ) : (
              <>
                <div>
                  <Label htmlFor="region">{t('select.region')}</Label>
                  <Select value={selectedRegion} onValueChange={onRegionChange}>
                    <SelectTrigger id="region" aria-label={t('select.region')} className="mt-1">
                      <SelectValue placeholder={t('select.regionPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {regions.map((r) => (
                        <SelectItem key={r.code} value={r.code}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="center">{t('select.center')}</Label>
                  <Select
                    value={effectiveCenterId}
                    onValueChange={onCenterChange}
                    disabled={!selectedRegion}
                  >
                    <SelectTrigger id="center" aria-label={t('select.center')} className="mt-1">
                      <SelectValue placeholder={t('select.centerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {centersInRegion.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {selectedCenter && (
              <div className="rounded-base border border-border p-3 text-sm">
                <p className="font-medium">{selectedCenter.name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-fg-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {selectedCenter.regionName ?? selectedCenter.regionCode ?? ''}
                  {selectedCenter.cercleName ? ` · ${selectedCenter.cercleName}` : ''}
                </p>
              </div>
            )}

            {isVulnerable ? (
              <div className="rounded-base border border-border bg-success-50 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-success-700">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {t('aside.priorityTitle')}
                </p>
                <p className="mt-1 text-fg-muted">{t('aside.priorityBody')}</p>
              </div>
            ) : (
              <div className="rounded-base border border-border bg-bg-muted/40 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Info className="size-4" aria-hidden="true" />
                  {t('aside.standardTitle')}
                </p>
                <p className="mt-1 text-fg-muted">{t('aside.standardBody')}</p>
              </div>
            )}

            <div className="rounded-base border border-border p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <PackageCheck className="size-4" aria-hidden="true" />
                {t('aside.bringTitle')}
              </p>
              <ul className="mt-2 space-y-1.5 text-fg-muted">
                {[t('aside.bring1'), t('aside.bring2'), t('aside.bring3')].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-3.5 shrink-0 text-success-700"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Colonne DROITE : date & créneau ──────────────────────────── */}
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="size-4" aria-hidden="true" />
              {t('calendar.title')}
            </h2>

            {!effectiveCenterId ? (
              <Alert>
                <AlertDescription>{t('select.chooseCenterFirst')}</AlertDescription>
              </Alert>
            ) : availability.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : availability.isError ? (
              <Alert variant="danger">
                <AlertTitle>{t('form.error')}</AlertTitle>
                <AlertDescription>
                  {availability.error instanceof Error ? availability.error.message : ''}
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="rounded-base border border-border p-2">
                  <Calendar
                    selected={selectedDay ?? undefined}
                    onSelect={onDaySelect}
                    min={windowMin}
                    max={windowMax}
                    disabled={(d) => !availableDays.has(localIso(d))}
                    locale={locale}
                    className="w-full"
                  />
                </div>
                <p className="text-xs text-fg-muted">{t('calendar.legend')}</p>

                {!selectedDay ? (
                  <Alert>
                    <AlertDescription>{t('slots.pickDayFirst')}</AlertDescription>
                  </Alert>
                ) : daySlots.length === 0 ? (
                  <Alert>
                    <AlertDescription>{t('slots.noneToday')}</AlertDescription>
                  </Alert>
                ) : (
                  <fieldset className="space-y-4">
                    <legend className="sr-only">{t('form.slot')}</legend>
                    {prioritySlots.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success-700">
                          {t('slots.priorityTitle')}
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {prioritySlots.map(renderSlot)}
                        </div>
                      </div>
                    )}
                    {standardSlots.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                          {t('slots.standardTitle')}
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {standardSlots.map(renderSlot)}
                        </div>
                      </div>
                    )}
                  </fieldset>
                )}

                {selectedSlot && (
                  <div className="space-y-3 rounded-base border border-primary/40 bg-primary-50/40 p-4">
                    <p className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                      {t('recap.title')}
                    </p>
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-fg-muted">{t('confirm.center')}</dt>
                      <dd className="font-medium">{selectedCenter?.name ?? ''}</dd>
                      <dt className="text-fg-muted">{t('confirm.date')}</dt>
                      <dd className="font-medium capitalize">
                        {selectedDay ? dayLabel(localIso(selectedDay)) : ''}
                      </dd>
                      <dt className="text-fg-muted">{t('confirm.slot')}</dt>
                      <dd className="font-mono font-medium">{timeOf(selectedSlot.start)}</dd>
                    </dl>

                    {/* Réservation active en live comme en démo : l'échange SSO
                        dual-token (ADR-036) est réconcilié et validé bout-en-bout. */}
                    <div>
                      <Label htmlFor="reason">{t('form.reason')}</Label>
                      <textarea
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        minLength={5}
                        maxLength={100}
                        required
                        placeholder={t('form.reasonPlaceholder')}
                        className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    </div>

                    <div className="flex items-start gap-3 rounded-base border border-border bg-bg-card p-3">
                      <Checkbox
                        id="pledge"
                        checked={pledge}
                        onCheckedChange={(checked) => setPledge(checked === true)}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor="pledge"
                        className="text-sm font-normal leading-snug text-fg-muted"
                      >
                        {t('form.pledge')}
                      </Label>
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
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </form>

      {/* Modale de confirmation ; le QR décoratif est réservé au mode démo — en
          live, on ne montre pas de QR tant que document-service n'émet pas le QR signé. */}
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
                <p className="text-sm text-fg-muted">
                  {mockMode ? t('confirm.subtitle') : t('confirm.subtitleLive')}
                </p>
              </div>
            </div>

            {/* QR décoratif : mode démo uniquement (le QR signé réel viendra de
                document-service). En live, aucun QR trompeur n'est présenté. */}
            {mockMode && (
              <div className="flex flex-col items-center gap-2 py-2">
                <DemoQrCode value={confirmation.reference} />
                <p className="text-xs font-medium">{t('confirm.qrCaption')}</p>
                <p className="text-center text-[11px] text-fg-muted">{t('confirm.qrNote')}</p>
              </div>
            )}

            <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-fg-muted">{t('confirm.center')}</dt>
              <dd className="font-medium">{confirmation.centerName}</dd>
              <dt className="text-fg-muted">{t('confirm.date')}</dt>
              <dd className="font-medium capitalize">{confirmation.dateLabel}</dd>
              <dt className="text-fg-muted">{t('confirm.slot')}</dt>
              <dd className="font-mono font-medium">{confirmation.time}</dd>
              <dt className="text-fg-muted">{t('confirm.queue')}</dt>
              <dd className="font-medium">
                {confirmation.queue != null ? `#${confirmation.queue}` : t('confirm.queuePending')}
              </dd>
              <dt className="text-fg-muted">{t('confirm.reference')}</dt>
              <dd className="font-mono">{confirmation.reference}</dd>
              {nina && (
                <>
                  <dt className="text-fg-muted">{t('confirm.nina')}</dt>
                  <dd className="font-mono">{formatNina(nina)}</dd>
                </>
              )}
            </dl>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => downloadIcs(confirmation)}
              >
                <CalendarPlus className="size-4" aria-hidden="true" />
                {t('confirm.addToCalendar')}
              </Button>
              <Button onClick={finish} className="w-full" size="lg">
                {t('confirm.done')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
