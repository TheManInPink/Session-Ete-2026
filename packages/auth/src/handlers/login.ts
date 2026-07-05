/**
 * @file        handlers/login.ts
 * @description Factory du route handler GET /api/auth/login — initie le flow
 *              OIDC Authorization Code + PKCE. En mode mock, redirige direct.
 *
 *              Les apps consomment via un shim :
 *
 *                // apps/citizen/app/api/auth/login/route.ts
 *                import { buildLoginHandler } from '@nina-aes/auth';
 *                export const GET = buildLoginHandler({
 *                  clientId: 'nina-citizen',
 *                  appPublicUrl: process.env.APP_PUBLIC_URL!,
 *                });
 *
 * @module      @nina-aes/auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { resolveNextPath } from '../next-path';
import type { AuthConfig } from '../types';

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(bytes = 32): string {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

export function buildLoginHandler(config: AuthConfig) {
  return async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const locale = url.searchParams.get('locale') ?? config.defaultLocale ?? 'fr';
    // `next` arrive déjà préfixé par la locale (proxys, pages protégées,
    // providers) — validé puis utilisé tel quel ; seul le défaut est préfixé.
    const nextPath = resolveNextPath(url.searchParams.get('next'), locale, config.defaultNext);

    const authMode =
      config.authMode ?? ((process.env.NINA_AUTH_MODE ?? 'mock') as 'mock' | 'keycloak');
    if (authMode === 'mock') {
      return NextResponse.redirect(new URL(nextPath, req.url));
    }

    const issuer = config.keycloakIssuer ?? process.env.KEYCLOAK_ISSUER ?? '';
    if (!issuer) {
      return NextResponse.json({ error: 'KEYCLOAK_ISSUER non configuré' }, { status: 500 });
    }

    const codeVerifier = randomString(32);
    const codeChallenge = base64UrlEncode(
      crypto.createHash('sha256').update(codeVerifier).digest(),
    );
    const state = randomString(16);
    const nonce = randomString(16);

    const jar = await cookies();
    jar.set('oidc_state', JSON.stringify({ codeVerifier, state, nonce, next: nextPath, locale }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });

    const authUrl = new URL(`${issuer}/protocol/openid-connect/auth`);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('redirect_uri', `${config.appPublicUrl}/api/auth/callback`);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    return NextResponse.redirect(authUrl.toString());
  };
}
