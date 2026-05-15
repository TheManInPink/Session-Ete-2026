/**
 * @file        route.ts (callback)
 * @description Reçoit le `code` de Keycloak après authentification, l'échange
 *              contre `{access_token, refresh_token, id_token}` via le token
 *              endpoint (avec `code_verifier` PKCE), valide l'ID token, puis
 *              pose les cookies httpOnly et redirige vers `next`.
 * @module      @nina-aes/citizen
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { z } from 'zod';

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'http://localhost:4001';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? '';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? 'nina-citizen';

/** Réponse attendue du token endpoint Keycloak. */
const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  id_token: z.string(),
  expires_in: z.number().int().positive(),
  refresh_expires_in: z.number().int().positive(),
  token_type: z.string(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return redirectToLogin(req, 'missing_code');
  }

  // Récupérer les paramètres OIDC stockés en cookie
  const jar = await cookies();
  const stored = jar.get('oidc_state')?.value;
  if (!stored) return redirectToLogin(req, 'no_session');

  let parsedState: { codeVerifier: string; state: string; nonce: string; next: string; locale: string };
  try {
    parsedState = JSON.parse(stored);
  } catch {
    return redirectToLogin(req, 'corrupted_state');
  }

  if (parsedState.state !== state) {
    return redirectToLogin(req, 'state_mismatch');
  }

  // Échanger le code contre les tokens
  const tokenRes = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KEYCLOAK_CLIENT_ID,
      code,
      redirect_uri: `${APP_PUBLIC_URL}/api/auth/callback`,
      code_verifier: parsedState.codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return redirectToLogin(req, 'token_exchange_failed');
  }

  const parsed = TokenResponseSchema.safeParse(await tokenRes.json());
  if (!parsed.success) {
    return redirectToLogin(req, 'invalid_token_response');
  }
  const tokens = parsed.data;

  // Vérifier l'ID token (signature + nonce + audience)
  try {
    const jwks = createRemoteJWKSet(
      new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`),
    );
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: KEYCLOAK_ISSUER,
      audience: KEYCLOAK_CLIENT_ID,
    });
    if (payload.nonce !== parsedState.nonce) {
      return redirectToLogin(req, 'nonce_mismatch');
    }
  } catch {
    return redirectToLogin(req, 'id_token_invalid');
  }

  // Tout est OK : poser les cookies et rediriger
  const res = NextResponse.redirect(
    new URL(`/${parsedState.locale}${parsedState.next}`, req.url),
  );
  const secure = process.env.NODE_ENV === 'production';

  res.cookies.set('access_token', tokens.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expires_in,
  });
  res.cookies.set('refresh_token', tokens.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: tokens.refresh_expires_in,
  });
  res.cookies.set('id_token', tokens.id_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth/logout',
    maxAge: tokens.refresh_expires_in,
  });
  res.cookies.delete('oidc_state');

  return res;
}

/** Redirige vers /fr/login avec un code d'erreur en query. */
function redirectToLogin(req: NextRequest, reason: string): NextResponse {
  const url = new URL('/fr/login', req.url);
  url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}
