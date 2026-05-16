/**
 * @file        route.ts (refresh admin)
 * @description Refresh silencieux du access_token. Pattern miroir
 *              d'`apps/citizen/app/api/auth/refresh/route.ts`.
 * @module      @nina-aes/admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER ?? '';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? 'nina-admin';

const RefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
  refresh_expires_in: z.number().int().positive(),
});

export async function POST(_req: NextRequest) {
  const jar = await cookies();
  const refresh = jar.get('refresh_token')?.value;
  if (!refresh) return NextResponse.json({ ok: false, reason: 'no_refresh_token' }, { status: 401 });

  const tokenRes = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: KEYCLOAK_CLIENT_ID,
      refresh_token: refresh,
    }),
  });
  if (!tokenRes.ok) {
    const res = NextResponse.json({ ok: false, reason: 'refresh_failed' }, { status: 401 });
    res.cookies.delete('access_token');
    res.cookies.delete('refresh_token');
    res.cookies.delete('id_token');
    return res;
  }

  const parsed = RefreshResponseSchema.safeParse(await tokenRes.json());
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'invalid_response' }, { status: 502 });
  const tokens = parsed.data;

  const res = NextResponse.json({ ok: true, expiresIn: tokens.expires_in });
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set('access_token', tokens.access_token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: tokens.expires_in,
  });
  res.cookies.set('refresh_token', tokens.refresh_token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/api/auth/refresh', maxAge: tokens.refresh_expires_in,
  });
  return res;
}
