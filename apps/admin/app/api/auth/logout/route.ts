/**
 * @file        route.ts (logout admin)
 * @description Déconnecte l'agent : révoque session Keycloak + supprime
 *              cookies + redirige sur end_session. Pattern miroir
 *              d'`apps/citizen/app/api/auth/logout/route.ts`.
 * @module      @nina-aes/admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const AUTH_MODE = (process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'http://localhost:4002';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? '';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? 'nina-admin';

export async function POST(req: NextRequest) {
  return doLogout(req);
}
export async function GET(req: NextRequest) {
  return doLogout(req);
}

async function doLogout(req: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  const refresh = jar.get('refresh_token')?.value;
  const idToken = jar.get('id_token')?.value;

  if (AUTH_MODE !== 'mock' && refresh) {
    await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: KEYCLOAK_CLIENT_ID, refresh_token: refresh }),
    }).catch(() => null);
  }

  let redirectUrl: string;
  if (AUTH_MODE === 'keycloak' && idToken && KEYCLOAK_ISSUER) {
    const fc = new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/logout`);
    fc.searchParams.set('id_token_hint', idToken);
    fc.searchParams.set('post_logout_redirect_uri', `${APP_PUBLIC_URL}/fr/login`);
    redirectUrl = fc.toString();
  } else {
    redirectUrl = new URL('/fr/login', req.url).toString();
  }

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.delete('access_token');
  res.cookies.delete('refresh_token');
  res.cookies.delete('id_token');
  return res;
}
