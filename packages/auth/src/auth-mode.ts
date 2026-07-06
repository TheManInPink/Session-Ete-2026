/**
 * @file        auth-mode.ts
 * @description Résolution centralisée du mode d'authentification (mock|keycloak)
 *              avec garde de production FAIL-CLOSED.
 *
 *              Auparavant chaque handler résolvait `process.env.NINA_AUTH_MODE
 *              ?? 'mock'` : une simple variable d'env oubliée en production
 *              basculait TOUTE l'app en mode `mock`, fabriquant une session
 *              privilégiée (admin/ministre) sans vérifier le moindre jeton.
 *              Cette fonction supprime ce fail-open.
 *
 * @module      @nina-aes/auth
 */

import type { AuthConfig, AuthMode } from './types';

/**
 * Résout le mode d'auth effectif, par ordre de priorité :
 *   1. `config.authMode` (injecté explicitement par l'app),
 *   2. `process.env.NINA_AUTH_MODE`,
 *   3. défaut selon l'environnement : `keycloak` en production, `mock` sinon.
 *
 * 🔒 KILL-SWITCH PRODUCTION : le mode `mock` court-circuite Keycloak et fabrique
 * une session sans vérification de jeton (A07 OWASP — Authentication Failures).
 * On REFUSE donc `mock` lorsque `NODE_ENV === 'production'`, sauf opt-in
 * explicite `NINA_ALLOW_MOCK_AUTH=true` (démo / soutenance hors-ligne assumée).
 * Fail-closed : on lève une exception plutôt que de dégrader silencieusement.
 *
 * @param config Configuration d'auth de l'app (seul `authMode` est lu ici).
 * @returns Le mode d'auth effectif, garanti sûr pour l'environnement courant.
 * @throws  Error si `mock` est demandé en production sans opt-in explicite.
 */
export function resolveAuthMode(config: Pick<AuthConfig, 'authMode'>): AuthMode {
  const isProd = process.env.NODE_ENV === 'production';
  const mode: AuthMode =
    config.authMode ??
    (process.env.NINA_AUTH_MODE as AuthMode | undefined) ??
    (isProd ? 'keycloak' : 'mock');

  if (mode === 'mock' && isProd && process.env.NINA_ALLOW_MOCK_AUTH !== 'true') {
    throw new Error(
      "SÉCURITÉ : authMode='mock' est interdit en production — il fabrique une " +
        'session privilégiée sans vérification de jeton. Définir NINA_AUTH_MODE=keycloak, ' +
        'ou NINA_ALLOW_MOCK_AUTH=true pour une démo explicitement assumée.',
    );
  }
  return mode;
}
