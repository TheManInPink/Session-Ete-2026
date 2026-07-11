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

    // Expiration alignée sur les PATH posés au callback (`access_token` = `/`,
    // `refresh_token` = `/api/auth/refresh`, `id_token` = `/api/auth/logout`). Un
    // `delete(name)` utilise le path par défaut `/` et ne purgerait donc PAS les
    // deux cookies au scope plus étroit : ils survivraient à la déconnexion — et un
    // `refresh_token` résiduel encore valide pourrait re-forger une session.
    const secure = process.env.NODE_ENV === 'production';
    const kill = { httpOnly: true, secure, sameSite: 'lax' as const, maxAge: 0 };
    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set('access_token', '', { ...kill, path: '/' });
    res.cookies.set('refresh_token', '', { ...kill, path: '/api/auth/refresh' });
    res.cookies.set('id_token', '', { ...kill, path: '/api/auth/logout' });
    // Session applicative citoyenne (ADR-036) — posée au scope `/` au callback.
    res.cookies.set('backend_access_token', '', { ...kill, path: '/' });
    return res;
  }

  return {
    POST: doLogout,
    GET: doLogout,
  };
}
