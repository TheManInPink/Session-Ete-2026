/**
 * @file        api/ussd-sim/route.ts
 * @description BFF **dev/démo uniquement** du simulateur USSD-01.
 *
 *              Le simulateur (navigateur) ne peut PAS appeler `/ussd/callback`
 *              en direct : le webhook attend le format Africa's Talking et est
 *              gardé par `AtAuthenticityGuard` (secret partagé + IP allowlist).
 *              Ce route handler same-origin fait le pont : il compose le DTO
 *              webhook et relaie vers `ussd-service`, en gardant le secret
 *              partagé CÔTÉ SERVEUR (jamais exposé au client).
 *
 *              🔒 SÉCURITÉ :
 *                - désactivé en production sauf opt-in `NINA_ENABLE_USSD_SIM=true`
 *                  (outil de démo, pas une surface de prod) ;
 *                - timeout dur (`AbortSignal.timeout`) → jamais de requête
 *                  pendante (anti-slowloris côté BFF) ;
 *                - aucune IP/UA client n'est transmise au service ;
 *                - entrées strictement validées avant relais.
 *
 * @module      @nina-aes/citizen
 */

import { NextRequest, NextResponse } from 'next/server';

/** Outil de démo : actif hors production, ou en prod sur opt-in explicite. */
const USSD_SIM_ENABLED =
  process.env.NODE_ENV !== 'production' || process.env.NINA_ENABLE_USSD_SIM === 'true';

/** URL interne du service USSD (webhook hors préfixe /api/v1). */
const USSD_SERVICE_URL = process.env.USSD_SERVICE_URL ?? 'http://localhost:3014';
/** Code court simulé (Orange Mali *123#). */
const USSD_SERVICE_CODE = process.env.USSD_SERVICE_CODE ?? '*123#';
/** Coupe-circuit : le service doit répondre vite (session USSD synchrone). */
const REQUEST_TIMEOUT_MS = 8_000;

/** Réponse 400 normalisée. */
function badRequest(message: string): NextResponse {
  return NextResponse.json({ code: 'INVALID_INPUT', message }, { status: 400 });
}

/**
 * Relaie une interaction USSD simulée vers `ussd-service`.
 * Corps attendu : `{ sessionId: string, text: string, phoneNumber?: string }`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!USSD_SIM_ENABLED) {
    return NextResponse.json(
      { code: 'DISABLED', message: 'Simulateur USSD désactivé.' },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Corps JSON invalide.');
  }

  const { sessionId, text, phoneNumber } = (body ?? {}) as Record<string, unknown>;

  // ── Validation stricte (le service revalide, mais on borne au plus tôt) ─────
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 128) {
    return badRequest('sessionId invalide.');
  }
  if (typeof text !== 'string' || text.length > 512) {
    return badRequest('text invalide.');
  }
  const phone =
    typeof phoneNumber === 'string' && phoneNumber.trim().length > 0
      ? phoneNumber.trim()
      : '+22366000000';
  if (!/^\+?\d{6,20}$/.test(phone)) {
    return badRequest('phoneNumber invalide (format E.164 attendu).');
  }

  const payload = { sessionId, serviceCode: USSD_SERVICE_CODE, phoneNumber: phone, text };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'text/plain',
  };
  // Secret partagé côté serveur uniquement (staging) — jamais côté client.
  const secret = process.env.AT_WEBHOOK_SHARED_SECRET;
  if (secret) headers['x-at-webhook-secret'] = secret;

  try {
    const upstream = await fetch(`${USSD_SERVICE_URL}/ussd/callback`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // Le service renvoie "CON ..." / "END ..." en text/plain.
    const responseText = await upstream.text();
    return NextResponse.json({ text: responseText, upstreamStatus: upstream.status });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json(
      {
        code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
        message: timedOut
          ? "Le service USSD n'a pas répondu à temps."
          : 'Service USSD injoignable — est-il démarré (port 3014) ?',
      },
      { status: timedOut ? 504 : 502 },
    );
  }
}
