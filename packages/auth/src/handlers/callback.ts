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
import { resolveNextPath } from '../next-path';
import { exchangeBackendToken } from './backend-exchange';
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
    // Locale de repli tant que le cookie oidc_state n'est pas décodé.
    let locale = config.defaultLocale ?? 'fr';

    if (!code || !state) return redirectToLogin(req, 'missing_code', locale);

    const jar = await cookies();
    const stored = jar.get('oidc_state')?.value;
    if (!stored) return redirectToLogin(req, 'no_session', locale);

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
      return redirectToLogin(req, 'corrupted_state', locale);
    }
    locale = parsedState.locale ?? locale;
    if (parsedState.state !== state) return redirectToLogin(req, 'state_mismatch', locale);

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
    if (!tokenRes.ok) return redirectToLogin(req, 'token_exchange_failed', locale);

    const parsed = TokenResponseSchema.safeParse(await tokenRes.json());
    if (!parsed.success) return redirectToLogin(req, 'invalid_token_response', locale);
    const tokens = parsed.data;

    try {
      const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
      const { payload } = await jwtVerify(tokens.id_token, jwks, {
        issuer,
        audience: config.clientId,
      });
      if (payload.nonce !== parsedState.nonce)
        return redirectToLogin(req, 'nonce_mismatch', locale);
    } catch {
      return redirectToLogin(req, 'id_token_invalid', locale);
    }

    // `next` provient du cookie oidc_state (non signé) : re-validation avant
    // usage tel quel — déjà préfixé locale par les producteurs, jamais re-préfixé.
    const res = NextResponse.redirect(
      new URL(resolveNextPath(parsedState.next, locale, config.defaultNext), req.url),
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

    // Échange SSO citoyen (ADR-036) : token Keycloak → session applicative
    // auth-service, posée en cookie `backend_access_token` (scope `/`, lu par le
    // BFF + les RSC). Non-fatal : si non configuré (admin/gov) ou en échec, la
    // session Keycloak reste valide (appels backend authentifiés → 401 → re-login).
    // Sur échec avec échange configuré, on purge tout token backend périmé.
    const backend = await exchangeBackendToken(config, tokens.access_token);
    if (backend) {
      res.cookies.set('backend_access_token', backend.access, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: backend.expiresIn,
      });
    } else if (config.backendExchangeUrl) {
      res.cookies.set('backend_access_token', '', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    }

    res.cookies.delete('oidc_state');
    return res;
  };
}

function redirectToLogin(req: NextRequest, reason: string, locale: string): NextResponse {
  const url = new URL(`/${locale}/login`, req.url);
  url.searchParams.set('error', reason);
  return NextResponse.redirect(url);
}
