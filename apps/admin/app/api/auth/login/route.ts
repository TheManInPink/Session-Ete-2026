/**
 * @file        route.ts (login admin)
 * @description Démarre le flow OIDC Authorization Code + PKCE pour la console
 *              agent CTDEC (client Keycloak `nina-admin`).
 *
 *              Pattern miroir d'`apps/citizen/app/api/auth/login/route.ts`.
 *              En mode `mock`, redirige immédiatement vers `/[locale]/dashboard`.
 *
 * @module      @nina-aes/admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const AUTH_MODE = (process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'http://localhost:4002';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? '';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? 'nina-admin';

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(bytes = 32): string {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const nextPath = url.searchParams.get('next') ?? '/dashboard';
  const locale = url.searchParams.get('locale') ?? 'fr';

  if (AUTH_MODE === 'mock') {
    return NextResponse.redirect(new URL(`/${locale}${nextPath}`, req.url));
  }

  if (!KEYCLOAK_ISSUER) {
    return NextResponse.json({ error: 'KEYCLOAK_ISSUER non configuré' }, { status: 500 });
  }

  const codeVerifier = randomString(32);
  const codeChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  );
  const state = randomString(16);
  const nonce = randomString(16);

  const jar = await cookies();
  jar.set(
    'oidc_state',
    JSON.stringify({ codeVerifier, state, nonce, next: nextPath, locale }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    },
  );

  const authUrl = new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/auth`);
  authUrl.searchParams.set('client_id', KEYCLOAK_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('redirect_uri', `${APP_PUBLIC_URL}/api/auth/callback`);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);

  return NextResponse.redirect(authUrl.toString());
}
