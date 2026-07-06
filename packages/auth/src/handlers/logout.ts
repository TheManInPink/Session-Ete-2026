/**
 * @file        handlers/logout.ts
 * @description Factory du route handler /api/auth/logout (GET + POST).
 *              Révoque la session côté Keycloak (back-channel) + supprime
 *              les cookies + redirige sur end_session (front-channel).
 * @module      @nina-aes/auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { resolveAuthMode } from '../auth-mode';
import type { AuthConfig } from '../types';

export function buildLogoutHandler(config: AuthConfig) {
  async function doLogout(req: NextRequest): Promise<NextResponse> {
    const jar = await cookies();
    const refresh = jar.get('refresh_token')?.value;
    const idToken = jar.get('id_token')?.value;
    const authMode = resolveAuthMode(config);
    const issuer = config.keycloakIssuer ?? process.env.KEYCLOAK_ISSUER ?? '';

    if (authMode !== 'mock' && refresh && issuer) {
      await fetch(`${issuer}/protocol/openid-connect/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          refresh_token: refresh,
        }),
      }).catch(() => null);
    }

    let redirectUrl: string;
    const locale = config.defaultLocale ?? 'fr';
    if (authMode === 'keycloak' && idToken && issuer) {
      const fc = new URL(`${issuer}/protocol/openid-connect/logout`);
      fc.searchParams.set('id_token_hint', idToken);
      fc.searchParams.set('post_logout_redirect_uri', `${config.appPublicUrl}/${locale}/login`);
      redirectUrl = fc.toString();
    } else {
      redirectUrl = new URL(`/${locale}/login`, req.url).toString();
    }

    const res = NextResponse.redirect(redirectUrl);
    res.cookies.delete('access_token');
    res.cookies.delete('refresh_token');
    res.cookies.delete('id_token');
    return res;
  }

  return {
    POST: doLogout,
    GET: doLogout,
  };
}
