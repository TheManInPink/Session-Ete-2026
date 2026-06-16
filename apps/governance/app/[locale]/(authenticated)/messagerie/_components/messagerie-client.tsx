/**
 * @file        messagerie-client.tsx
 * @description Client de la messagerie officielle — layout 3 colonnes :
 *              liste des conversations · fil de messages signés · panneau détail.
 *              Chaque message porte un badge de signature Ed25519 (vérifiée) et
 *              un accusé de réception horodaté.
 *
 *              Données 100 % mock. En production, fetch via governance-service
 *              et vérification réelle de la signature côté serveur.
 * @module      @nina-aes/governance
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@nina-aes/ui/components/button';
import { Input } from '@nina-aes/ui/components/input';
import { cn } from '@nina-aes/ui/lib/utils';
import { Search, ShieldCheck, Paperclip, Send, CheckCheck } from 'lucide-react';

type Classification = 'ROUTINE' | 'URGENT' | 'CRITIQUE';

interface GovMessage {
  id: string;
  senderName: string;
  senderInstitution: string;
  sentAt: string;
  body: string;
  classification: Classification;
  signatureHash: string;
  readAt: string | null;
  attachments?: { name: string }[];
}

interface GovConversation {
  id: string;
  institution: string;
  subject: string;
  unread: boolean;
  classification: Classification;
  lastAt: string;
  messages: GovMessage[];
}

/** Conversations fictives entre institutions de l'AES (démo). */
const CONVERSATIONS: GovConversation[] = [
  {
    id: 'conv-1',
    institution: "Ministère de l'Intérieur — Mali",
    subject: "Directive d'harmonisation des bases NINA",
    unread: true,
    classification: 'URGENT',
    lastAt: '2026-06-15T16:10:00Z',
    messages: [
      {
        id: 'm1',
        senderName: 'Ibrahim Maïga',
        senderInstitution: "Ministère de l'Intérieur — Mali",
        sentAt: '2026-06-15T14:32:00Z',
        body: "Madame, Monsieur,\n\nSuite à la réunion du Conseil des Ministres AES du 1er juin, veuillez trouver ci-joint la directive d'harmonisation des bases NINA. Mise en œuvre attendue sous 30 jours.",
        classification: 'URGENT',
        signatureHash: 'a7b3c9d2e1f4',
        readAt: '2026-06-15T15:01:00Z',
        attachments: [{ name: 'directive_harmonisation_v2.pdf' }],
      },
      {
        id: 'm2',
        senderName: 'Général Issa Ousmane Coulibaly',
        senderInstitution: 'CTDEC — Direction',
        sentAt: '2026-06-15T16:10:00Z',
        body: "Bien reçu. Le CTDEC engage la mise en conformité dès cette semaine ; un point d'étape vous sera transmis sous 10 jours.",
        classification: 'ROUTINE',
        signatureHash: 'f4e1a0b97c52',
        readAt: null,
      },
    ],
  },
  {
    id: 'conv-2',
    institution: 'BCID-AES — Secrétariat',
    subject: 'Calendrier de déploiement du passeport AES',
    unread: false,
    classification: 'ROUTINE',
    lastAt: '2026-06-12T09:20:00Z',
    messages: [
      {
        id: 'm3',
        senderName: 'Aminata Touré',
        senderInstitution: 'BCID-AES — Secrétariat',
        sentAt: '2026-06-12T09:20:00Z',
        body: 'Le calendrier de déploiement du passeport commun AES (phase 2) est joint pour validation des trois États membres.',
        classification: 'ROUTINE',
        signatureHash: 'b21d8e4a3f70',
        readAt: '2026-06-12T10:05:00Z',
      },
    ],
  },
  {
    id: 'conv-3',
    institution: 'DNEC — Direction',
    subject: 'Budget Q2 — maintenance des centres CTDEC',
    unread: false,
    classification: 'ROUTINE',
    lastAt: '2026-06-10T11:45:00Z',
    messages: [
      {
        id: 'm4',
        senderName: 'Seydou Konaté',
        senderInstitution: 'DNEC — Direction',
        sentAt: '2026-06-10T11:45:00Z',
        body: "L'enveloppe Q2 pour la maintenance des centres d'enrôlement est arbitrée. Détail par région en pièce jointe.",
        classification: 'ROUTINE',
        signatureHash: 'c0a7f3b2d918',
        readAt: '2026-06-10T14:30:00Z',
      },
    ],
  },
  {
    id: 'conv-4',
    institution: 'Ministère de la Sécurité — Burkina Faso',
    subject: 'Protocole mTLS : renouvellement des certificats',
    unread: true,
    classification: 'CRITIQUE',
    lastAt: '2026-06-09T08:05:00Z',
    messages: [
      {
        id: 'm5',
        senderName: 'Boukary Ouédraogo',
        senderInstitution: 'Ministère de la Sécurité — Burkina Faso',
        sentAt: '2026-06-09T08:05:00Z',
        body: "Les certificats client mTLS de l'interopérabilité expirent le 30 juin. Merci de coordonner la rotation côté Mali avant cette échéance.",
        classification: 'CRITIQUE',
        signatureHash: 'd9e2c1b840a6',
        readAt: null,
      },
    ],
  },
  {
    id: 'conv-5',
    institution: 'DGEC — Niger',
    subject: "Demande d'accès à l'API de vérification transfrontalière",
    unread: false,
    classification: 'URGENT',
    lastAt: '2026-06-05T15:50:00Z',
    messages: [
      {
        id: 'm6',
        senderName: 'Hadiza Maïkano',
        senderInstitution: 'DGEC — Niger',
        sentAt: '2026-06-05T15:50:00Z',
        body: "Nous sollicitons l'ouverture d'un accès à l'API de vérification AES pour nos postes frontaliers de Téra et Ayorou.",
        classification: 'URGENT',
        signatureHash: 'e3f0a9d271bc',
        readAt: '2026-06-05T16:40:00Z',
      },
    ],
  },
];

const CLASSIFICATION_STYLES: Record<Classification, string> = {
  ROUTINE: 'bg-bg-muted text-fg-muted',
  URGENT: 'bg-warning-50 text-warning-700',
  CRITIQUE: 'bg-danger-50 text-danger-700',
};

/** Badge de classification (Routine/Urgent/Critique) — composant module-level. */
function ClassificationBadge({ c }: { c: Classification }) {
  const t = useTranslations('governance.messagerie');
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        CLASSIFICATION_STYLES[c],
      )}
    >
      {t(`classification.${c}`)}
    </span>
  );
}

export function MessagerieClient({ locale }: { locale: string }) {
  const t = useTranslations('governance.messagerie');
  const [selectedId, setSelectedId] = useState(CONVERSATIONS[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const selected = CONVERSATIONS.find((c) => c.id === selectedId) ?? CONVERSATIONS[0];

  // Filtrage des conversations (institution ou sujet).
  const query = search.trim().toLowerCase();
  const visible = query
    ? CONVERSATIONS.filter(
        (c) =>
          c.institution.toLowerCase().includes(query) || c.subject.toLowerCase().includes(query),
      )
    : CONVERSATIONS;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Africa/Bamako',
    });

  return (
    <div className="flex h-screen flex-col">
      {/* Bandeau démo (honnêteté) */}
      <div className="shrink-0 border-b border-warning/40 bg-warning-50 px-4 py-1.5 text-center text-xs text-warning-700">
        {t('demoBanner')}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Colonne 1 — Conversations ─────────────────────────────────── */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <h1 className="mb-2 text-lg font-bold">{t('conversationsLabel')}</h1>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="pl-8"
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto" aria-label={t('conversationsLabel')}>
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'w-full border-b border-border p-3 text-left transition-colors hover:bg-bg-muted',
                    selectedId === c.id && 'bg-primary-50',
                  )}
                  aria-current={selectedId === c.id ? 'true' : undefined}
                  aria-label={`${c.institution} — ${c.subject} — ${t(`classification.${c.classification}`)}${c.unread ? ` — ${t('unread')}` : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{c.institution}</p>
                    {c.unread && (
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <p className="truncate text-xs text-fg-muted">{c.subject}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <ClassificationBadge c={c.classification} />
                    <span className="text-[11px] text-fg-muted">{fmt(c.lastAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Colonne 2 — Fil de messages signés ────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selected && (
            <>
              <div className="shrink-0 border-b border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{selected.institution}</h2>
                    <p className="text-sm text-fg-muted">{selected.subject}</p>
                  </div>
                  <ClassificationBadge c={selected.classification} />
                </div>
              </div>

              <div
                className="flex-1 space-y-4 overflow-y-auto bg-bg p-4"
                role="log"
                aria-label={selected.subject}
              >
                {selected.messages.map((m) => (
                  <article key={m.id} className="rounded-lg border border-border bg-bg-card p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{m.senderName}</p>
                        <p className="text-xs text-fg-muted">{m.senderInstitution}</p>
                      </div>
                      <span className="text-xs text-fg-muted">{fmt(m.sentAt)}</span>
                    </div>

                    <p className="whitespace-pre-wrap text-sm text-fg">{m.body}</p>

                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.attachments.map((a, idx) => (
                          <span
                            key={`${m.id}-att-${idx}`}
                            className="inline-flex items-center gap-1.5 rounded-base border border-border px-2 py-1 text-xs"
                          >
                            <Paperclip className="size-3.5 text-fg-muted" aria-hidden="true" />
                            {a.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Badge signature Ed25519 */}
                    <div className="mt-3 rounded-base border border-success/30 bg-success-50/60 p-3 text-xs">
                      <p className="flex items-center gap-1.5 font-medium text-success-700">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        {t('signature.label')} · ✓ {t('signature.verified')}
                      </p>
                      <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-fg-muted">
                        <dt>{t('signature.signer')}</dt>
                        <dd className="text-fg">{m.senderName}</dd>
                        <dt>{t('signature.hash')}</dt>
                        <dd className="font-mono text-fg">{m.signatureHash}…</dd>
                        <dt>{t('signature.timestamp')}</dt>
                        <dd className="text-fg">{fmt(m.sentAt)}</dd>
                      </dl>
                    </div>

                    {/* Accusé de réception */}
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
                      {m.readAt ? (
                        <>
                          <CheckCheck className="size-3.5 text-primary" aria-hidden="true" />
                          {t('readReceipt')} · {fmt(m.readAt)}
                        </>
                      ) : (
                        t('notRead')
                      )}
                    </p>
                  </article>
                ))}
              </div>

              {/* Zone de composition (démo) */}
              <div className="shrink-0 border-t border-border p-3">
                <textarea
                  rows={2}
                  placeholder={t('compose.placeholder')}
                  aria-label={t('compose.placeholder')}
                  className="flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <ShieldCheck className="size-3.5 text-success-700" aria-hidden="true" />
                    {t('compose.sign')}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled
                    aria-disabled="true"
                    aria-label={`${t('compose.send')} — ${t('compose.demoNote')}`}
                    title={t('compose.demoNote')}
                  >
                    <Send className="size-4" aria-hidden="true" />
                    {t('compose.send')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Colonne 3 — Détail ────────────────────────────────────────── */}
        <aside
          className="hidden w-72 shrink-0 flex-col border-l border-border p-4 lg:flex"
          aria-label={t('detail.title')}
        >
          {selected && (
            <>
              <h2 className="mb-3 font-semibold">{t('detail.title')}</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-fg-muted">
                    {t('detail.participants')}
                  </dt>
                  <dd className="mt-1 font-medium">{selected.institution}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-fg-muted">
                    {t('detail.classification')}
                  </dt>
                  <dd className="mt-1">
                    <ClassificationBadge c={selected.classification} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-fg-muted">
                    {t('detail.messages')}
                  </dt>
                  <dd className="mt-1 font-medium">{selected.messages.length}</dd>
                </div>
              </dl>
              <p className="mt-auto rounded-base border border-border bg-bg-muted/40 p-2 text-[11px] text-fg-muted">
                {t('detail.archive')}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
