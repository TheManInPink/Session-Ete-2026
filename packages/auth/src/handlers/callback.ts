/**
 * @file        handlers/callback.ts
 * @description Factory du route handler GET /api/auth/callback — échange du
 *              code OIDC + vérification ID token + pose des cookies de session.
 * @module      @nina-aes/auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { z } from 'zod';
import type { AuthConfig } from '../types';

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  id_token: z.string(),
  expires_in: z.number().int().positive(),
  refresh_expires_in: z.number().int().positive(),
  token_type: z.string(),
});

export function buildCallbackHandler(config: AuthConfig) {
  return async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const issuer = config.keycloakIssuer ?? process.env.KEYCLOAK_ISSUER ?? '';

    if (!code || !state) return redirectToLogin(req, 'missing_code');

    const jar = await cookies();
    const stored = jar.get('oidc_state')?.value;
    if (!stored) return redirectToLogin(req, 'no_session');

    let parsedState: {
      codeVerifier: string;
      state: string;
      nonce: string;
      next: string;
      locale: string;
    };
    try {
      parsedState = JSON.parse(stored);
    } catch {
      return redirectToLogin(req, 'corrupted_state');
    }
    if (parsedState.state !== state) return redirectToLogin(req, 'state_mismatch');

    const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        redirect_uri: `${config.appPublicUrl}/api/auth/callback`,
        code_verifier: parsedState.codeVerifier,
      }),
    });
    if (!tokenRes.ok) return redirectToLogin(req, 'token_exchange_failed');

    const parsed = TokenResponseSchema.safeParse(await tokenRes.json());
    if (!parsed.success) return redirectToLogin(req, 'invalid_token_response');
    const tokens = parsed.data;

    try {
      const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer,
        audience: config.clientId,
      });
      if (payload.nonce !== parsedState.nonce) return redirectToLogin(req, 'nonce_mismatch');
    } catch {
      return redirectToLogin(req, 'id_token_invalid');
    }

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
  };
}

function redirectToLogin(req: NextRequest, reason: string): NextResponse {
  const url = new URL('/fr/login', req.url);
  url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}
