/**
 * @file        appointment-form.tsx
 * @description Formulaire de prise de RDV — sélection centre + créneau (groupés
 *              par jour) + motif, suivi d'une modale de confirmation présentant
 *              un récapitulatif et un QR code de rendez-vous.
 *
 *              **Mode démo** : créneaux fictifs en mémoire, succès simulé, et QR
 *              décoratif déterministe (le QR signé réel sera émis par
 *              `document-service`, cf. doc 10). Aucun appel réseau.
 * @module      @nina-aes/citizen
 */

'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatNina } from '@nina-aes/utils';
import { Button } from '@nina-aes/ui/components/button';
import { Label } from '@nina-aes/ui/components/label';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Badge } from '@nina-aes/ui/components/badge';
import { Calendar, MapPin, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';

/** Centres mockés — en prod, fetch depuis `/api/v1/centers`. */
const MOCK_CENTERS = [
  { id: 'ctdec-bamako', name: 'CTDEC Bamako', region: 'Bamako (District)' },
  { id: 'ravec-kayes', name: 'Antenne RAVEC Kayes', region: 'Kayes' },
  { id: 'ravec-sikasso', name: 'Antenne RAVEC Sikasso', region: 'Sikasso' },
  { id: 'ravec-mopti', name: 'Antenne RAVEC Mopti', region: 'Mopti' },
];

interface Slot {
  id: string;
  date: string;
  time: string;
  priority: 'P1' | 'P2' | 'P3';
}

/**
 * Génère 6 créneaux fictifs sur les 3 prochains jours ouvrés.
 *
 * TODO Session backend — Migration appointment-service (port 3008, doc 09) :
 *   remplacer par un fetch server-side `api.appointment.getAvailableSlots(...)`
 *   dans `page.tsx`, passé en prop ici. Le mock reste derrière la même forme de
 *   données (la « couture » côté écran ne change pas).
 */
function generateMockSlots(isPriority: boolean): Slot[] {
  const now = new Date();
  const slots: Slot[] = [];
  for (let i = 1; i <= 3; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    const dateStr = day.toISOString().slice(0, 10);
    // En mode prioritaire (P1), créneaux dès 7h ; sinon dès 9h.
    const baseHour = isPriority ? 7 : 9;
    for (let h = 0; h < 2; h++) {
      slots.push({
        id: `${dateStr}-${baseHour + h}h00`,
        date: dateStr,
        time: `${String(baseHour + h).padStart(2, '0')}:00`,
        priority: isPriority ? 'P1' : 'P3',
      });
    }
  }
  return slots;
}

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
 *
 * Le QR signé réel (JWT RS256) sera produit par `document-service`. Ici on rend
 * une matrice 25×25 reproductible à partir d'un hash de `value`, avec les trois
 * motifs de détection caractéristiques, pour matérialiser l'UX de confirmation.
 */
function DemoQrCode({ value, size = 132 }: { value: string; size?: number }) {
  const N = 25;
  let state = hashString(value) || 1;
  const rand = () => {
    // xorshift32 déterministe
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
  isPriority: boolean;
  nina: string;
}

interface Confirmation {
  centerName: string;
  dateLabel: string;
  time: string;
  queue: number;
  reference: string;
}

export function AppointmentForm({ locale, isPriority, nina }: AppointmentFormProps) {
  const t = useTranslations('appointments');
  const router = useRouter();
  const [centerId, setCenterId] = useState<string>('');
  const [slotId, setSlotId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const slots = generateMockSlots(isPriority);
  const slotsByDay = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[s.date] ??= []).push(s);
    return acc;
  }, {});
  const canSubmit = centerId && slotId && reason.trim().length >= 5;

  /** Ferme la modale et redirige vers le tableau de bord. */
  const finish = () => router.push(`/${locale}/dashboard?appointment=1`);

  // Fermeture de la modale au clavier (Échap).
  useEffect(() => {
    if (!confirmation) return;
    // Déplace le focus clavier dans la modale à l'ouverture (accessibilité).
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmation]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        // Mode démo : succès simulé (aucun appel HTTP réel)
        await new Promise((r) => setTimeout(r, 600));
        const center = MOCK_CENTERS.find((c) => c.id === centerId);
        const slot = slots.find((s) => s.id === slotId);
        if (!center || !slot) throw new Error('Sélection incomplète');
        const seed = hashString(`${centerId}|${slotId}|${nina}`);
        setConfirmation({
          centerName: center.name,
          dateLabel: new Date(slot.date).toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
          time: slot.time,
          queue: (seed % 40) + 1,
          reference: `RDV-2026-${String(seed % 10000).padStart(4, '0')}`,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      }
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sélection du centre */}
        <fieldset>
          <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
            <MapPin className="size-4" aria-hidden="true" />
            {t('form.center')}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MOCK_CENTERS.map((c) => (
              <label
                key={c.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-base border p-3 transition-colors',
                  'hover:border-primary hover:bg-primary-50/30',
                  centerId === c.id ? 'border-primary bg-primary-50' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name="center"
                  value={c.id}
                  checked={centerId === c.id}
                  onChange={(e) => setCenterId(e.target.value)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-fg-muted">{c.region}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Sélection du créneau, regroupé par jour */}
        <fieldset>
          <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Calendar className="size-4" aria-hidden="true" />
            {t('form.slot')}
          </legend>
          <div className="space-y-4">
            {Object.entries(slotsByDay).map(([date, daySlots]) => (
              <div key={date}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {new Date(date).toLocaleDateString(locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {daySlots.map((s) => (
                    <label
                      key={s.id}
                      className={cn(
                        'flex cursor-pointer items-center justify-center gap-1 rounded-base border p-3 text-sm transition-colors',
                        'hover:border-primary hover:bg-primary-50/30',
                        slotId === s.id ? 'border-primary bg-primary-50' : 'border-border',
                      )}
                    >
                      <input
                        type="radio"
                        name="slot"
                        value={s.id}
                        checked={slotId === s.id}
                        onChange={(e) => setSlotId(e.target.value)}
                        aria-label={`${new Date(date).toLocaleDateString(locale, {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })} ${s.time}`}
                        className="sr-only"
                      />
                      <span className="font-mono font-medium">{s.time}</span>
                      {isPriority && (
                        <Badge className="bg-success-50 px-1.5 py-0 text-xs text-success-700">
                          {s.priority}
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
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

        <Button type="submit" disabled={!canSubmit || isPending} className="w-full" size="lg">
          {isPending ? (
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
