/**
 * @file        api/v1/[...path]/route.ts
 * @description BFF (Backend-for-Frontend) — proxy d'API **authentifié**.
 *
 *              Les composants client appellent ce route handler same-origin ;
 *              il lit le cookie httpOnly `access_token`, l'injecte en
 *              `Authorization: Bearer` et relaie vers le gateway interne. Le
 *              token n'est donc jamais accessible au JavaScript (anti-XSS).
 *
 *              ⚠️ Les en-têtes `Authorization` venant du client sont ignorés :
 *              seul le cookie httpOnly fait foi (on ne fait pas confiance au
 *              client pour s'auto-attribuer une identité).
 *
 *              Miroir d'apps/citizen (ADR-031). Le portail gouvernance n'a pas
 *              de flux anonyme : TOUT passe par ce proxy en mode live.
 *
 * @module      @nina-aes/governance
 */

import { NextRequest, NextResponse } from 'next/server';
import { gatewayInternalUrl } from '../../../../lib/api/config';

/** Coupe-circuit du proxy : au-delà, on renvoie 504 au lieu de rester pendant. */
const GATEWAY_TIMEOUT_MS = 15_000;

/** Relaie une requête vers le gateway en injectant le Bearer depuis le cookie. */
async function forward(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;

  // Défense en profondeur : rejeter explicitement toute traversée de chemin au
  // lieu de se reposer sur la normalisation implicite de `fetch()`/`URL`. Next
  // décode les segments du catch-all : un `%2e%2e` arrive ici en `..`.
  if (path.some((seg) => seg === '.' || seg === '..' || seg.length === 0)) {
    return NextResponse.json(
      { code: 'INVALID_PATH', message: 'Chemin invalide.' },
      { status: 400 },
    );
  }

  const token = req.cookies.get('access_token')?.value;

  // Reconstruit le chemin cible (segments décodés par Next → on ré-encode).
  const target = `${gatewayInternalUrl()}/api/v1/${path
    .map(encodeURIComponent)
    .join('/')}${req.nextUrl.search}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;
  const correlationId = req.headers.get('x-correlation-id');
  if (correlationId) headers['x-correlation-id'] = correlationId;
  // Identité : UNIQUEMENT depuis le cookie httpOnly (jamais depuis le client).
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.text();

  try {
    // 🔒 `AbortSignal.timeout` : jamais de requête pendante (anti-slowloris /
    // épuisement de connexions côté BFF).
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json(
      timedOut
        ? { code: 'GATEWAY_TIMEOUT', message: 'Le service a mis trop de temps à répondre.' }
        : { code: 'GATEWAY_UNREACHABLE', message: 'Service indisponible.' },
      { status: timedOut ? 504 : 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;

// Ne jamais mettre en cache un proxy authentifié : sous `cacheComponents`
// (Next 16), les Route Handlers sont dynamiques par défaut et le segment
// config `export const dynamic` est interdit au build — l'absence de
// `'use cache'` suffit à garantir le non-cache.
