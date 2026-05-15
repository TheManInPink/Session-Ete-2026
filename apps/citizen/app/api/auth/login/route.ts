/**
 * @file        route.ts (login)
 * @description Démarre le flow OIDC Authorization Code + PKCE.
 *
 *              1. Génère `code_verifier` (PKCE) + `state` + `nonce` aléatoires
 *              2. Calcule `code_challenge = base64url(SHA256(code_verifier))`
 *              3. Stocke les 3 valeurs dans un cookie httpOnly chiffré (TTL 5 min)
 *              4. Redirige vers Keycloak `/protocol/openid-connect/auth?…`
 *
 *              En mode `mock`, redirige immédiatement vers `/dashboard` sans
 *              passer par Keycloak.
 * @module      @nina-aes/citizen
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const AUTH_MODE = (process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'http://localhost:4001';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? '';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? 'nina-citizen';

/** Encode en base64url (RFC 4648 §5). */
function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Génère une chaîne aléatoire cryptographique. */
function randomString(bytes = 32): string {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const nextPath = url.searchParams.get('next') ?? '/dashboard';
  const locale = url.searchParams.get('locale') ?? 'fr';

  // Mode mock : pas de Keycloak, on simule un login réussi
  if (AUTH_MODE === 'mock') {
    return NextResponse.redirect(new URL(`/${locale}${nextPath}`, req.url));
  }

  if (!KEYCLOAK_ISSUER) {
    return NextResponse.json(
      { error: 'KEYCLOAK_ISSUER non configuré' },
      { status: 500 },
    );
  }

  // 1) Génération des paramètres PKCE
  const codeVerifier = randomString(32);
  const codeChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  );
  const state = randomString(16);
  const nonce = randomString(16);

  // 2) Stocker les paramètres en cookie httpOnly (5 min TTL)
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

  // 3) Construire l'URL d'autorisation Keycloak
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
