/**
 * @file        appointment-form.tsx
 * @description Formulaire de prise de RDV — sélection centre + créneau + motif.
 * @module      @nina-aes/citizen
 */

'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@nina-aes/ui/components/button';
import { Label } from '@nina-aes/ui/components/label';
import { Alert, AlertDescription, AlertTitle } from '@nina-aes/ui/components/alert';
import { Badge } from '@nina-aes/ui/components/badge';
import { Calendar, MapPin, Send, Loader2 } from 'lucide-react';
import { cn } from '@nina-aes/ui/lib/utils';

/** Centres mockés — en prod, fetch depuis `/api/v1/centers`. */
const MOCK_CENTERS = [
  { id: 'ctdec-bamako', name: 'CTDEC Bamako', region: 'Bamako (District)' },
  { id: 'ravec-kayes', name: 'Antenne RAVEC Kayes', region: 'Kayes' },
  { id: 'ravec-sikasso', name: 'Antenne RAVEC Sikasso', region: 'Sikasso' },
  { id: 'ravec-mopti', name: 'Antenne RAVEC Mopti', region: 'Mopti' },
];

/**
 * Génère 6 créneaux fictifs sur les 3 prochains jours ouvrés.
 *
 * TODO Session 3+ — Migration appointment-service :
 *   Quand `appointment-service` (port 3008, cf. doc 09) sera livré,
 *   remplacer cette fonction par un appel server-side :
 *
 *     const slots = await api.appointment.getAvailableSlots({
 *       fromDate, toDate, centerId, isPriority,
 *     });
 *
 *   Faire le fetch dans le Server Component parent (`page.tsx`), passer
 *   `slots` en prop à `<AppointmentForm>`. La `<Suspense>` côté page
 *   restera utile comme frontière de streaming pour le fetch lui-même.
 *   Supprimer le `'use client'` de ce composant si possible (déléguer
 *   la sélection à un sous-composant client minimal).
 */
function generateMockSlots(isPriority: boolean) {
  const now = new Date();
  const slots: Array<{ id: string; date: string; time: string; priority: 'P1' | 'P2' | 'P3' }> = [];
  for (let i = 1; i <= 3; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    const dateStr = day.toISOString().slice(0, 10);
    // En mode prioritaire (P1), créneaux dès 7h30 ; sinon dès 9h00.
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

export function AppointmentForm({ locale, isPriority }: { locale: string; isPriority: boolean }) {
  const t = useTranslations('appointments');
  const router = useRouter();
  const [centerId, setCenterId] = useState<string>('');
  const [slotId, setSlotId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const slots = generateMockSlots(isPriority);
  const canSubmit = centerId && slotId && reason.trim().length >= 5;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        // Mode démo : succès simulé
        await new Promise((r) => setTimeout(r, 600));
        router.push(`/${locale}/dashboard?appointment=1`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      }
    });
  };

  return (
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

      {/* Sélection du créneau */}
      <fieldset>
        <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Calendar className="size-4" aria-hidden="true" />
          {t('form.slot')}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((s) => (
            <label
              key={s.id}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-base border p-3 text-sm transition-colors',
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
                className="sr-only"
              />
              <span className="font-medium">
                {new Date(s.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <span className="font-mono">{s.time}</span>
              {isPriority && (
                <Badge className="bg-success-50 px-1.5 py-0 text-xs text-success-700">{s.priority}</Badge>
              )}
            </label>
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
          className="mt-1 flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error && (
        <Alert variant="danger">
          <AlertTitle>{t('form.error')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={!canSubmit || isPending} className="w-full" size="lg">
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {t('form.submit')}
      </Button>
    </form>
  );
}
