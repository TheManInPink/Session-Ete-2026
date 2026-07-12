/**
 * @file        handlers/refresh.ts
 * @description Factory du route handler POST /api/auth/refresh — silent
 *              refresh du access_token via refresh_token. Supprime tous les
 *              cookies en cas d'échec pour forcer un re-login propre.
 * @module      @nina-aes/auth
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { exchangeBackendToken } from './backend-exchange';
import type { AuthConfig } from '../types';

const RefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
  refresh_expires_in: z.number().int().positive(),
});

export function buildRefreshHandler(config: AuthConfig) {
  return async function POST() {
    const jar = await cookies();
    const refresh = jar.get('refresh_token')?.value;
    if (!refresh) {
      return NextResponse.json({ ok: false, reason: 'no_refresh_token' }, { status: 401 });
    }

    const issuer = config.keycloakIssuer ?? process.env.KEYCLOAK_ISSUER ?? '';
    const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: refresh,
      }),
    });

    if (!tokenRes.ok) {
      const res = NextResponse.json({ ok: false, reason: 'refresh_failed' }, { status: 401 });
      res.cookies.delete('access_token');
      res.cookies.delete('refresh_token');
      res.cookies.delete('id_token');
      res.cookies.delete('backend_access_token');
      return res;
    }

    const parsed = RefreshResponseSchema.safeParse(await tokenRes.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, reason: 'invalid_response' }, { status: 502 });
    }
    const tokens = parsed.data;

    const res = NextResponse.json({ ok: true, expiresIn: tokens.expires_in });
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

    // Rafraîchit la session applicative (ADR-036) en ré-échangeant le nouveau
    // token Keycloak. Non-fatal (cf. callback) : sur échec, on purge le cookie.
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

    return res;
  };
}
