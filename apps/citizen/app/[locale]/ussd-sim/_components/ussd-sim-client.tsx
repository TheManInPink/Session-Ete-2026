/**
 * @file        ussd-sim-client.tsx
 * @description Pilote client du simulateur USSD-01 (USSD-01 de la maquette).
 *
 *              Gère l'état de session (sessionId, texte cumulé « 1*2*… », saisie
 *              courante), envoie chaque interaction au BFF dev `/api/ussd-sim`
 *              (qui relaie vers `ussd-service`), et rend `<UssdSimulator>` de
 *              `@nina-aes/ui`. Le clavier physique du PC est accepté (chiffres,
 *              `*`, `#`, Retour arrière, Entrée) en plus du pavé virtuel.
 *
 * @module      @nina-aes/citizen
 */

'use client';

import * as React from 'react';
import { UssdSimulator } from '@nina-aes/ui/components/business/ussd-simulator';
import { Button } from '@nina-aes/ui/components/button';

/** Numéro par défaut (modifiable) — sert au binding phone↔NINA du parcours. */
const DEFAULT_PHONE = '+22366123456';

/**
 * Sépare le préfixe protocolaire Africa's Talking du message affichable.
 * `CON` = la session continue ; `END` = la session est terminée.
 */
function stripPrefix(raw: string): { display: string; ended: boolean } {
  const trimmed = raw.replace(/^\s+/, '');
  if (trimmed.startsWith('END'))
    return { display: trimmed.slice(3).replace(/^\s+/, ''), ended: true };
  if (trimmed.startsWith('CON'))
    return { display: trimmed.slice(3).replace(/^\s+/, ''), ended: false };
  return { display: trimmed, ended: false };
}

export function UssdSimClient() {
  const [sessionId, setSessionId] = React.useState('');
  const [phone, setPhone] = React.useState(DEFAULT_PHONE);
  const [text, setText] = React.useState(''); // cumul « 1*2*… »
  const [input, setInput] = React.useState(''); // saisie courante (avant Répondre)
  const [screen, setScreen] = React.useState('');
  const [ended, setEnded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastResponse, setLastResponse] = React.useState('');

  // Refs miroir pour le handler clavier physique (évite les closures périmées).
  const inputRef = React.useRef('');
  const textRef = React.useRef('');
  const sessionRef = React.useRef('');
  const endedRef = React.useRef(false);
  const loadingRef = React.useRef(false);
  React.useEffect(() => {
    inputRef.current = input;
  }, [input]);
  React.useEffect(() => {
    textRef.current = text;
  }, [text]);
  React.useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  React.useEffect(() => {
    endedRef.current = ended;
  }, [ended]);
  React.useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  /** Envoie un callback USSD (texte cumulé complet) au BFF dev. */
  const send = React.useCallback(async (sid: string, fullText: string, phoneNumber: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ussd-sim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, text: fullText, phoneNumber }),
      });
      const data = (await res.json()) as { text?: string; message?: string };
      if (!res.ok) {
        setError(data.message ?? 'Erreur inconnue.');
        return;
      }
      const raw = String(data.text ?? '');
      const { display, ended: isEnd } = stripPrefix(raw);
      setScreen(display);
      setLastResponse(raw.slice(0, 60));
      setEnded(isEnd);
    } catch {
      setError('Impossible de joindre le simulateur.');
    } finally {
      setLoading(false);
    }
  }, []);

  /** (Re)démarre une session : nouveau sessionId + premier écran (menu langue). */
  const startSession = React.useCallback(() => {
    const sid = crypto.randomUUID();
    setSessionId(sid);
    setText('');
    setInput('');
    setEnded(false);
    void send(sid, '', phone);
  }, [send, phone]);

  // Démarrage unique (garde anti-double-invocation StrictMode en dev).
  const didInit = React.useRef(false);
  React.useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    startSession();
  }, [startSession]);

  /** Valide la saisie courante : l'ajoute au texte cumulé et envoie. */
  const handleReply = React.useCallback(
    (value: string) => {
      if (endedRef.current || loadingRef.current) return;
      const entry = value.trim();
      if (entry.length === 0) return;
      const nextText = textRef.current === '' ? entry : `${textRef.current}*${entry}`;
      setText(nextText);
      setInput('');
      void send(sessionRef.current, nextText, phone);
    },
    [send, phone],
  );

  // Clavier physique : chiffres / * / # → saisie ; Backspace ; Entrée → Répondre.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (endedRef.current) return;
      // Ignore si l'utilisateur tape dans le champ « numéro » (input texte).
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        setInput((v) => v + e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setInput((v) => v.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleReply(inputRef.current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleReply]);

  return (
    <div className="space-y-4">
      {/* Numéro appelant (modifiable) — pilote le binding phone↔NINA. */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ussd-phone" className="text-sm font-medium text-fg">
          Numéro appelant
        </label>
        <input
          id="ussd-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-48 rounded-base border border-border bg-bg-card px-3 py-1.5 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-describedby="ussd-phone-help"
        />
        <span id="ussd-phone-help" className="text-xs text-fg-muted">
          format E.164 (ex. +22366123456)
        </span>
      </div>

      {/* Bannière d'erreur (service arrêté, timeout, …). */}
      {error && (
        <div
          role="alert"
          className="rounded-base border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger-700"
        >
          {error}{' '}
          <button
            type="button"
            onClick={startSession}
            className="ml-1 underline underline-offset-2"
          >
            Réessayer
          </button>
        </div>
      )}

      <UssdSimulator
        screenText={loading ? '…' : screen}
        input={input}
        onInput={setInput}
        onReply={handleReply}
        onCancel={startSession}
        showKeypad={!ended}
        debug={{
          sessionId: sessionId || '—',
          accumulatedText: text || '(vide)',
          apiCall: 'POST /api/ussd-sim → /ussd/callback',
          lastResponse: lastResponse || '—',
        }}
      />

      {/* Session terminée : proposer de rappeler. */}
      {ended && (
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <span>Session terminée.</span>
          <Button variant="solid" size="sm" onClick={startSession}>
            Rappeler *123#
          </Button>
        </div>
      )}
    </div>
  );
}
