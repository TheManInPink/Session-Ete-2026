/**
 * @file        messagerie-client.tsx
 * @description GOV-01 — Client de la messagerie officielle SGOGT, branché sur
 *              `@nina-aes/api-client` (pattern citizen, ADR-031). Layout
 *              3 colonnes : fils de discussion · messages signés · panneau
 *              détail. L'inbox serveur est PLATE (`MessageView[]`) : le
 *              regroupement par `threadId` se fait ici, côté vue.
 *
 *              Polling 30 s (pas de WebSocket backend). Composition
 *              (`useSendSgogtMessage`), réponse (`useRespondSgogtMessage`),
 *              accusé de lecture automatique à l'ouverture d'un message non lu
 *              (`useAckSgogtMessage`) et vérification de signature à la demande
 *              (`useVerifySgogtMessage`). La signature est un **JWS RS256 émis
 *              côté serveur** via Vault Transit (ADR-026/034) — le client ne
 *              signe rien.
 *
 *              L'inbox ne renvoie que les messages REÇUS : les messages émis
 *              pendant la session sont conservés localement (`outbox`) et
 *              fusionnés dans les fils pour l'affichage.
 *
 * @module      @nina-aes/governance
 */

'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  useAckSgogtMessage,
  useApiMode,
  useRespondSgogtMessage,
  useSendSgogtMessage,
  useSgogtInbox,
  useVerifySgogtMessage,
} from '@nina-aes/api-client/react';
import type { MessageView, SgogtPriority } from '@nina-aes/api-client';
import { Button } from '@nina-aes/ui/components/button';
import { Input } from '@nina-aes/ui/components/input';
import { cn } from '@nina-aes/ui/lib/utils';
import { CheckCheck, Plus, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { composeRecipients, resolveOfficial } from '../../../../../lib/directory';

/** Intervalle de polling de l'inbox (ms) — pas de WebSocket backend. */
const INBOX_POLL_MS = 30_000;

/** Ordre de sévérité des priorités SGOGT (badge de fil = la plus haute). */
const PRIORITY_RANK: Record<SgogtPriority, number> = { NORMAL: 0, HIGH: 1, CRITICAL: 2 };

const PRIORITY_STYLES: Record<SgogtPriority, string> = {
  NORMAL: 'bg-bg-muted text-fg-muted',
  HIGH: 'bg-warning-50 text-warning-700',
  CRITICAL: 'bg-danger-50 text-danger-700',
};

/** Fil de discussion reconstruit côté vue à partir de l'inbox plate. */
interface ThreadView {
  id: string;
  subject: string;
  /** L'autre partie du fil (résolue via l'annuaire pour l'affichage). */
  interlocutorId: string;
  /** Priorité la plus sévère du fil. */
  priority: SgogtPriority;
  /** Au moins un message reçu non lu. */
  unread: boolean;
  lastAt: string;
  /** Messages en ordre chronologique croissant. */
  messages: MessageView[];
}

/** Tri chronologique croissant déterministe (départage par id). */
function byCreatedAtAsc(a: MessageView, b: MessageView): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/** Regroupe l'inbox plate (+ messages émis localement) en fils de discussion. */
function buildThreads(messages: MessageView[], viewerId: string): ThreadView[] {
  const byThread = new Map<string, MessageView[]>();
  for (const m of messages) {
    const bucket = byThread.get(m.threadId);
    if (bucket) bucket.push(m);
    else byThread.set(m.threadId, [m]);
  }
  const threads: ThreadView[] = [];
  for (const [id, bucket] of byThread) {
    const sorted = [...bucket].sort(byCreatedAtAsc);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    threads.push({
      id,
      subject: first.subject,
      interlocutorId: first.senderId === viewerId ? first.recipientId : first.senderId,
      priority: sorted.reduce<SgogtPriority>(
        (acc, m) => (PRIORITY_RANK[m.priority] > PRIORITY_RANK[acc] ? m.priority : acc),
        'NORMAL',
      ),
      unread: sorted.some((m) => m.recipientId === viewerId && m.readAt === null),
      lastAt: last.createdAt,
      messages: sorted,
    });
  }
  return threads.sort((a, b) => {
    if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/** Badge de priorité SGOGT (Normale/Haute/Critique) — composant module-level. */
function PriorityBadge({ p }: { p: SgogtPriority }) {
  const t = useTranslations('governance.messagerie');
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        PRIORITY_STYLES[p],
      )}
    >
      {t(`priority.${p}`)}
    </span>
  );
}

interface MessagerieClientProps {
  locale: string;
  /** Id de session du fonctionnaire connecté (mock : `mock-gov-001`). */
  viewerId: string;
}

export function MessagerieClient({ locale, viewerId }: MessagerieClientProps) {
  const t = useTranslations('governance.messagerie');
  const apiMode = useApiMode();

  // ── Données : inbox serveur (polling 30 s) + messages émis localement ─────
  const inboxQuery = useSgogtInbox({}, { refetchInterval: INBOX_POLL_MS });
  const [outbox, setOutbox] = useState<MessageView[]>([]);

  const threads = useMemo(() => {
    const seen = new Set<string>();
    const merged: MessageView[] = [];
    for (const m of [...(inboxQuery.data ?? []), ...outbox]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
    }
    return buildThreads(merged, viewerId);
  }, [inboxQuery.data, outbox, viewerId]);

  // ── Sélection fil + message (vérification de signature à la demande) ──────
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selected = threads.find((th) => th.id === selectedThreadId) ?? null;

  const query = search.trim().toLowerCase();
  const visible = query
    ? threads.filter(
        (th) =>
          th.subject.toLowerCase().includes(query) ||
          resolveOfficial(th.interlocutorId).name.toLowerCase().includes(query),
      )
    : threads;

  // Message inspecté : celui cliqué, sinon le dernier du fil sélectionné.
  const effectiveMessageId =
    selectedMessageId ?? selected?.messages[selected.messages.length - 1]?.id ?? '';
  const verifyQuery = useVerifySgogtMessage(effectiveMessageId);

  // ── Accusé de lecture automatique à l'ouverture d'un message non lu ───────
  const { mutate: ackMutate } = useAckSgogtMessage();
  const ackRequested = useRef(new Set<string>());
  useEffect(() => {
    if (!selected) return;
    for (const m of selected.messages) {
      if (m.recipientId === viewerId && m.readAt === null && !ackRequested.current.has(m.id)) {
        ackRequested.current.add(m.id);
        ackMutate(m.id);
      }
    }
  }, [selected, viewerId, ackMutate]);

  // ── Réponse (clôt la décision côté serveur) ───────────────────────────────
  const respondMutation = useRespondSgogtMessage();
  const [replyBody, setReplyBody] = useState('');
  // On répond au dernier message du fil qui NOUS est adressé (le serveur — et
  // le mock — refusent un respond dont on n'est pas le destinataire).
  const replyTarget = selected
    ? ([...selected.messages].reverse().find((m) => m.recipientId === viewerId) ?? null)
    : null;

  const handleReply = () => {
    if (!replyTarget || replyBody.trim().length === 0) return;
    respondMutation.mutate(
      { id: replyTarget.id, body: replyBody.trim() },
      {
        onSuccess: (reply) => {
          setOutbox((o) => [...o, reply]);
          setReplyBody('');
        },
      },
    );
  };

  // ── Composition d'un nouveau message ──────────────────────────────────────
  const sendMutation = useSendSgogtMessage();
  const recipients = useMemo(() => composeRecipients(viewerId), [viewerId]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipientId, setComposeRecipientId] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composePriority, setComposePriority] = useState<SgogtPriority>('NORMAL');

  const handleSend = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!composeRecipientId || !composeSubject.trim() || !composeBody.trim()) return;
    sendMutation.mutate(
      {
        recipientId: composeRecipientId,
        subject: composeSubject.trim(),
        body: composeBody.trim(),
        priority: composePriority,
      },
      {
        onSuccess: (message) => {
          setOutbox((o) => [...o, message]);
          setSelectedThreadId(message.threadId);
          setSelectedMessageId(null);
          setComposeOpen(false);
          setComposeRecipientId('');
          setComposeSubject('');
          setComposeBody('');
          setComposePriority('NORMAL');
        },
      },
    );
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Africa/Bamako',
    });

  /** Ligne d'état de la vérification de signature du message inspecté. */
  const renderVerifyState = () => {
    if (verifyQuery.isPending) {
      return (
        <p className="flex items-center gap-1.5 font-medium text-fg-muted">
          <ShieldQuestion className="size-4" aria-hidden="true" />
          {t('signature.verifying')}
        </p>
      );
    }
    if (verifyQuery.data?.valid) {
      return (
        <p className="flex items-center gap-1.5 font-medium text-success-700">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t('signature.verified')}
        </p>
      );
    }
    return (
      <p className="flex items-center gap-1.5 font-medium text-danger-700">
        <ShieldAlert className="size-4" aria-hidden="true" />
        {t('signature.invalid')}
      </p>
    );
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Bandeau démo (honnêteté) — uniquement en mode données mock */}
      {apiMode === 'mock' && (
        <div className="shrink-0 border-b border-warning/40 bg-warning-50 px-4 py-1.5 text-center text-xs text-warning-700">
          {t('demoBanner')}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Colonne 1 — Fils de discussion ────────────────────────────── */}
        <div className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold">{t('conversationsLabel')}</h1>
              <Button type="button" size="xs" onClick={() => setComposeOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                {t('newMessage')}
              </Button>
            </div>
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

          {inboxQuery.isPending ? (
            <p className="p-4 text-sm text-fg-muted">{t('loading')}</p>
          ) : inboxQuery.isError ? (
            <p className="p-4 text-sm text-danger-700">{t('loadError')}</p>
          ) : (
            <ul className="flex-1 overflow-y-auto" aria-label={t('conversationsLabel')}>
              {visible.length === 0 && <li className="p-4 text-sm text-fg-muted">{t('empty')}</li>}
              {visible.map((th) => {
                const interlocutor = resolveOfficial(th.interlocutorId);
                return (
                  <li key={th.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedThreadId(th.id);
                        setSelectedMessageId(null);
                      }}
                      className={cn(
                        'w-full border-b border-border p-3 text-left transition-colors hover:bg-bg-muted',
                        selectedThreadId === th.id && 'bg-primary-50',
                      )}
                      aria-current={selectedThreadId === th.id ? 'true' : undefined}
                      aria-label={`${interlocutor.name} — ${th.subject} — ${t(`priority.${th.priority}`)}${th.unread ? ` — ${t('unread')}` : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{interlocutor.name}</p>
                        {th.unread && (
                          <span
                            className="size-2 shrink-0 rounded-full bg-primary"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <p className="truncate text-xs text-fg-muted">{th.subject}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <PriorityBadge p={th.priority} />
                        <span className="text-[11px] text-fg-muted">{fmt(th.lastAt)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Colonne 2 — Fil de messages signés ────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <p className="m-auto p-6 text-sm text-fg-muted">{t('noSelection')}</p>
          ) : (
            <>
              <div className="shrink-0 border-b border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">
                      {resolveOfficial(selected.interlocutorId).name}
                    </h2>
                    <p className="text-sm text-fg-muted">{selected.subject}</p>
                  </div>
                  <PriorityBadge p={selected.priority} />
                </div>
              </div>

              <div
                className="flex-1 space-y-4 overflow-y-auto bg-bg p-4"
                role="log"
                aria-label={selected.subject}
              >
                {selected.messages.map((m) => {
                  const sender = resolveOfficial(m.senderId);
                  const inspected = m.id === effectiveMessageId;
                  return (
                    <article key={m.id} className="rounded-lg border border-border bg-bg-card p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{sender.name}</p>
                          {sender.title && <p className="text-xs text-fg-muted">{sender.title}</p>}
                        </div>
                        <span className="text-xs text-fg-muted">{fmt(m.createdAt)}</span>
                      </div>

                      <p className="whitespace-pre-wrap text-sm text-fg">{m.body}</p>

                      {/* Signature JWS (RS256, émise côté serveur via Vault Transit) */}
                      <div className="mt-3 rounded-base border border-border bg-bg-muted/40 p-3 text-xs">
                        {inspected ? (
                          <>
                            {renderVerifyState()}
                            {/* 🔒 L'identité du signataire n'est révélée comme
                                ATTESTÉE qu'APRÈS une vérification cryptographique
                                réussie (`valid === true`). Tant que la signature
                                n'est pas prouvée, afficher « Signataire : X »
                                donnerait une fausse autorité à un message
                                potentiellement usurpé. */}
                            {verifyQuery.data?.valid ? (
                              <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-fg-muted">
                                <dt>{t('signature.signer')}</dt>
                                <dd className="text-fg">{sender.name}</dd>
                                <dt>{t('signature.hash')}</dt>
                                <dd className="font-mono text-fg">{m.chainHash.slice(0, 12)}…</dd>
                                <dt>{t('signature.timestamp')}</dt>
                                <dd className="text-fg">{fmt(m.createdAt)}</dd>
                              </dl>
                            ) : verifyQuery.isPending ? null : (
                              <p className="mt-1.5 text-danger-700">
                                {t('signature.identityUnverified')}
                              </p>
                            )}
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setSelectedMessageId(m.id)}
                          >
                            <ShieldQuestion className="size-3.5" aria-hidden="true" />
                            {t('signature.check')}
                          </Button>
                        )}
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
                  );
                })}
              </div>

              {/* Zone de réponse (respond clôt la décision côté serveur) */}
              <div className="shrink-0 border-t border-border p-3">
                <textarea
                  rows={2}
                  value={replyBody}
                  maxLength={20_000}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder={t('reply.placeholder')}
                  aria-label={t('reply.placeholder')}
                  disabled={!replyTarget}
                  className="flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <ShieldCheck className="size-3.5 text-success-700" aria-hidden="true" />
                    {t('compose.sign')}
                  </span>
                  <div className="flex items-center gap-2">
                    {respondMutation.isError && (
                      <span className="text-xs text-danger-700" role="alert">
                        {t('reply.error')}
                      </span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={!replyTarget || replyBody.trim().length === 0}
                      loading={respondMutation.isPending}
                      onClick={handleReply}
                    >
                      {t('reply.send')}
                    </Button>
                  </div>
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
                  <dd className="mt-1 font-medium">
                    {resolveOfficial(selected.interlocutorId).name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-fg-muted">
                    {t('detail.priority')}
                  </dt>
                  <dd className="mt-1">
                    <PriorityBadge p={selected.priority} />
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

      {/* ── Modale de composition ─────────────────────────────────────────── */}
      {composeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('compose.title')}
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-bg-card p-4 shadow-lg">
            <h2 className="mb-3 text-lg font-semibold">{t('compose.title')}</h2>
            <form onSubmit={handleSend} className="space-y-3">
              <div>
                <label htmlFor="compose-recipient" className="mb-1 block text-sm font-medium">
                  {t('compose.recipient')}
                </label>
                <select
                  id="compose-recipient"
                  required
                  value={composeRecipientId}
                  onChange={(e) => setComposeRecipientId(e.target.value)}
                  className="flex h-10 w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="" disabled>
                    {t('compose.recipientPlaceholder')}
                  </option>
                  {recipients.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {o.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="compose-subject" className="mb-1 block text-sm font-medium">
                  {t('compose.subject')}
                </label>
                <Input
                  id="compose-subject"
                  required
                  maxLength={300}
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="compose-priority" className="mb-1 block text-sm font-medium">
                  {t('compose.priorityLabel')}
                </label>
                <select
                  id="compose-priority"
                  value={composePriority}
                  onChange={(e) => setComposePriority(e.target.value as SgogtPriority)}
                  className="flex h-10 w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {(['NORMAL', 'HIGH', 'CRITICAL'] as const).map((p) => (
                    <option key={p} value={p}>
                      {t(`priority.${p}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="compose-body" className="mb-1 block text-sm font-medium">
                  {t('compose.body')}
                </label>
                <textarea
                  id="compose-body"
                  required
                  rows={5}
                  maxLength={20_000}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder={t('compose.placeholder')}
                  className="flex w-full rounded-base border border-border bg-bg-card px-3 py-2 text-sm placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                <ShieldCheck className="size-3.5 text-success-700" aria-hidden="true" />
                {t('compose.sign')}
              </p>
              {sendMutation.isError && (
                <p className="text-xs text-danger-700" role="alert">
                  {t('compose.error')}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setComposeOpen(false)}
                >
                  {t('compose.cancel')}
                </Button>
                <Button type="submit" size="sm" loading={sendMutation.isPending}>
                  {t('compose.send')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
